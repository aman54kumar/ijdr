from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from .models import Journal, Article
from .firebase_config import db, bucket
import os


@receiver(post_save, sender=Journal)
def sync_journal_to_firestore(sender, instance, **kwargs):
    data = {
        'volume': instance.volume,
        'number': instance.number,
        'edition': instance.edition,
        'ssn': instance.ssn,
        'title': f"Vol. {instance.volume} No. {instance.number} ({instance.edition})",
    }
    db.collection('journals').document(str(instance.id)).set(data)


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


@receiver(post_delete, sender=Article)
def delete_article_from_firestore(sender, instance, **kwargs):
    db.collection('journals').document(str(instance.journal.id)) \
        .collection('articles').document(str(instance.id)).delete()
