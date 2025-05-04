from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import Journal, Article
from .firebase_config import db, bucket
import subprocess
import os
from django.conf import settings
import re
from pathlib import Path
from django.core.files import File
import shutil


def sanitize_filename(title):
    title = title.replace(" ", "_")
    title = re.sub(r'[^a-zA-Z0-9_]', '', title)
    return title


@receiver(post_save, sender=Journal)
def sync_journal_to_firestore(sender, instance, created, **kwargs):
    extracted_pdfs = []

    def sanitize_filename(title):
        title = title.replace(" ", "_")
        return re.sub(r'[^a-zA-Z0-9_]', '', title)

    data = {
        'volume': instance.volume,
        'number': instance.number,
        'edition': instance.edition,
        'ssn': instance.ssn,
        'title': f"Vol. {instance.volume} No. {instance.number} ({instance.edition})",
    }
    db.collection('journals').document(str(instance.id)).set(data)

    if created and instance.pdf_file:
        exe_path = Path(settings.BASE_DIR) / 'journals' / 'pdf-extractor.exe'
        config_dir = Path(settings.BASE_DIR) / 'journals' / 'configs'
        extracted_dir = Path(settings.BASE_DIR) / 'journals' / 'extracted'

        try:
            subprocess.run([
                str(exe_path), 'get', 'chapters',
                '--file=' + str(instance.pdf_file.path),
                '--output-path=' + str(config_dir)
            ], check=True)

            subprocess.run([
                str(exe_path), 'extract',
                '--file=' + str(instance.pdf_file.path),
                '--config-path=' + str(config_dir),
                '--output-path=' + str(extracted_dir),
                '--ends-with=Guidelines for Contributors'
            ], check=True)

            # Read extracted article titles and authors
            articles_txt = config_dir / 'articles.txt'
            authors_txt = config_dir / 'authors.txt'

            if articles_txt.exists() and authors_txt.exists():
                with open(articles_txt, 'r', encoding='utf-8') as f:
                    articles = [line.strip()
                                for line in f.readlines() if line.strip()]
                with open(authors_txt, 'r', encoding='utf-8') as f:
                    authors = [line.strip()
                               for line in f.readlines() if line.strip()]

                if len(articles) != len(authors):
                    print("[ERROR] Mismatched number of articles and authors.")
                    return

                for idx, (title, author) in enumerate(zip(articles, authors), start=1):
                    sanitized_title = sanitize_filename(title)
                    pdf_path = extracted_dir / f"{sanitized_title}.pdf"

                    if not pdf_path.exists():
                        print(
                            f"[WARNING] No PDF found for article '{title}' -> tried '{pdf_path.name}'")
                        continue

                    article = Article.objects.create(
                        journal=instance,
                        article_number=idx,
                        title=title,
                        authors=author,
                    )

                    with open(pdf_path, 'rb') as f:
                        django_file = File(f)
                        article.pdf.save(pdf_path.name, django_file, save=True)
                        article.save()

                    extracted_pdfs.append(article.pdf.path)
                    print(
                        f"[INFO] Article '{title}' created with PDF '{pdf_path.name}'")

        except subprocess.CalledProcessError as e:
            print(f"[ERROR] PDF extraction failed: {e}")
        except Exception as ex:
            print(f"[ERROR] Unexpected error: {ex}")
        finally:
            # 🧹 Cleanup temp folders and files
            for path in [config_dir, extracted_dir]:
                if path.exists():
                    shutil.rmtree(path)
                    print(f"[CLEANUP] Deleted folder: {path}")

            for pdf_path in extracted_pdfs:
                try:
                    if os.path.exists(pdf_path):
                        os.remove(pdf_path)
                        print(f"[CLEANUP] Deleted temp PDF: {pdf_path}")
                except Exception as cleanup_err:
                    print(
                        f"[WARNING] Failed to delete {pdf_path}: {cleanup_err}")


@receiver(post_save, sender=Article)
def upload_pdf_to_firebase(sender, instance, **kwargs):
    if instance.pdf and not instance.pdf_url:
        pdf_path = instance.pdf.path
        file_name = f"articles/{os.path.basename(pdf_path)}"
        blob = bucket.blob(file_name)
        blob.upload_from_filename(pdf_path)
        blob.make_public()

        instance.pdf_url = blob.public_url
        instance.save(update_fields=['pdf_url'])

        # Save article metadata to Firestore under journal
        article_data = {
            'title': instance.title,
            'authors': instance.authors,
            'abstract': instance.abstract,
            'article_number': instance.article_number,
            'pdf_url': instance.pdf_url,
            'tags': [tag.name for tag in instance.tags.all()]
        }
        db.collection('journals') \
            .document(str(instance.journal.id)) \
            .collection('articles') \
            .document(str(instance.id)).set(article_data)


@receiver(post_delete, sender=Article)
def delete_article_from_firestore(sender, instance, **kwargs):
    db.collection('journals').document(str(instance.journal.id)) \
        .collection('articles').document(str(instance.id)).delete()
