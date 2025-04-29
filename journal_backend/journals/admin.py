from django.contrib import admin
from .models import Journal, Tag, Article


@admin.register(Journal)
class JournalAdmin(admin.ModelAdmin):
    list_display = ('id', 'edition', 'volume', 'number',  'ssn')


@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = ('title', 'journal', 'article_number', 'authors')
    ordering = ('journal', 'article_number')
    # This allows a nice UI for selecting multiple tags
    filter_horizontal = ('tags',)


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ('name',)
