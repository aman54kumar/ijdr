from rest_framework.routers import DefaultRouter
from .views import JournalViewSet, ArticleViewSet

router = DefaultRouter()
router.register(r'journals', JournalViewSet)
router.register(r'articles', ArticleViewSet)

urlpatterns = router.urls
