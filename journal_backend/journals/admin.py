from django.contrib import admin
from .models import Journal, Tag, Article
from django import forms
from django.utils import timezone

class JournalForm(forms.ModelForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        current_year = timezone.now().year
        self.fields['year'].widget = forms.Select(
            choices=[(year, year) for year in range(1900, current_year + 11)]
        )

    class Meta:
        model = Journal
        fields = '__all__'

@admin.register(Journal)
class JournalAdmin(admin.ModelAdmin):
    form = JournalForm
    list_display = ['volume', 'number', 'get_edition', 'ssn']
    list_filter = ['volume', 'number', 'year', 'period']
    search_fields = ['volume', 'number', 'year']

    def get_readonly_fields(self, request, obj=None):
        return ['get_edition']

    def get_edition(self, obj):
        return obj.edition
    get_edition.short_description = 'Edition'

@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = ('title', 'journal', 'article_number', 'authors')
    ordering = ('journal', 'article_number')
    filter_horizontal = ('tags',)

@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ('name',)
