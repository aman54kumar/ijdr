import graphene
from graphene_django import DjangoObjectType
from journals.models import Journal, Article, Tag


class TagType(DjangoObjectType):
    class Meta:
        model = Tag
        fields = ("id", "name")


class ArticleType(DjangoObjectType):
    class Meta:
        model = Article
        fields = ("id", "article_number", "title",
                  "authors", "abstract", "pdf_url", "tags")


class JournalType(DjangoObjectType):
    class Meta:
        model = Journal
        fields = ("id", "volume", "number", "edition", "ssn",
                  "articles")

    def resolve_articles(self, info):
        return self.articles.all()


class Query(graphene.ObjectType):
    journals = graphene.List(JournalType)
    journal = graphene.Field(JournalType, id=graphene.Int(required=True))

    def resolve_journals(root, info):
        return Journal.objects.all()

    def resolve_journal(root, info, id):
        return Journal.objects.get(id=id)


schema = graphene.Schema(query=Query)
