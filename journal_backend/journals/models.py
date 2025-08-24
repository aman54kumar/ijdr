from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.core.validators import MinValueValidator, MaxValueValidator
def validate_year(value):
    current_year = timezone.now().year
    if value < 2015 or value > current_year + 10:
        raise ValidationError(f"Year must be between 2015 and {current_year + 10}.")

class Journal(models.Model):
    PERIOD_CHOICES = [
        ('jan-jun', 'January - June'),
        ('jul-dec', 'July - December'),
    ]
    current_year = timezone.now().year
    volume = models.IntegerField()
    number = models.IntegerField(choices=[(i, i) for i in range(1, 3)], default=1)
    ssn = models.CharField(max_length=20, blank=True, null=True, default="2249-104X")
    pdf_file = models.FileField(upload_to='journals/')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    year = models.IntegerField(
        default=timezone.now().year,
        validators=[
        MinValueValidator(2015),
        MaxValueValidator(current_year)
    ],
        help_text="Enter the publication year (e.g., 2023)"
    )
    period = models.CharField(
        max_length=7,
        choices=PERIOD_CHOICES,
        default='jan-jun'
    )

    @property
    def edition(self):
        period_display = dict(self.PERIOD_CHOICES).get(self.period, '')
        return f"{period_display}, {self.year}"

    def __str__(self):
        return f"Vol. {self.volume} No. {self.number} ({self.edition})"

    class Meta:
        unique_together = ['volume', 'number', 'year', 'period']


class Tag(models.Model):
    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.name


class Article(models.Model):
    journal = models.ForeignKey(Journal, on_delete=models.CASCADE, related_name='articles')
    article_number = models.IntegerField()
    title = models.CharField(max_length=255)
    authors = models.CharField(max_length=500)
    abstract = models.TextField(null=True, blank=True)
    pdf = models.FileField(upload_to='temp_pdfs/', blank=True, null=True)
    pdf_url = models.URLField(blank=True, null=True)
    tags = models.ManyToManyField(Tag, blank=True)

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        super().save(*args, **kwargs)
        if is_new:
            default_tags = Tag.objects.filter(name__in=['Science', 'Technology', 'Engineering'])
            self.tags.add(*default_tags)

    def __str__(self):
        return f"{self.title} (Vol. {self.journal.volume} No. {self.journal.number})"

    class Meta:
        ordering = ['article_number']
