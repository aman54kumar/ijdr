from django.db import models


class Journal(models.Model):
    edition = models.CharField(max_length=255, blank=True, null=True)
    volume = models.IntegerField()
    number = models.IntegerField()
    ssn = models.CharField(max_length=20, blank=True, null=True)
    pdf_file = models.FileField(upload_to='journals/')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    def __str__(self):
        return f"Vol. {self.volume} No. {self.number}"


class Tag(models.Model):
    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.name


class Article(models.Model):
    journal = models.ForeignKey(
        Journal, on_delete=models.CASCADE, related_name='articles')
    article_number = models.IntegerField()
    title = models.CharField(max_length=255)
    authors = models.CharField(max_length=500)
    abstract = models.TextField(null=True, blank=True)

    pdf = models.FileField(upload_to='temp_pdfs/',
                           blank=True, null=True)  # local temp storage
    pdf_url = models.URLField(blank=True, null=True)  # Firebase Storage URL

    tags = models.ManyToManyField('Tag', blank=True)

    def save(self, *args, **kwargs):
        is_new = self.pk is None  # check if the object is not yet saved
        super().save(*args, **kwargs)  # first save the object

        if is_new:
            default_tags = Tag.objects.filter(
                name__in=['Science', 'Technology', 'Engineering']
            )
            self.tags.add(*default_tags)

    def __str__(self):
        return f"{self.title} (Vol. {self.journal.volume} No. {self.journal.number}"

    class Meta:
        ordering = ['article_number']
