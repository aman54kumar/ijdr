from rest_framework import viewsets
from .models import Journal, Article
from .serializers import JournalSerializer, ArticleSerializer
import requests
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from urllib.parse import urlparse
from django.http import HttpResponse, HttpResponseBadRequest, HttpResponseForbidden, HttpResponseServerError


class JournalViewSet(viewsets.ModelViewSet):
    queryset = Journal.objects.all()
    serializer_class = JournalSerializer


class ArticleViewSet(viewsets.ModelViewSet):
    queryset = Article.objects.all()
    serializer_class = ArticleSerializer


@csrf_exempt
def pdf_proxy(request):
    pdf_url = request.GET.get('url')
    if not pdf_url:
        return HttpResponseBadRequest('URL parameter required')

    try:
        # Validate Firebase URL
        parsed = urlparse(pdf_url)
        if not parsed.netloc.endswith('firebasestorage.googleapis.com'):
            return HttpResponseForbidden('Invalid PDF source')

        # Stream with proper headers
        headers = {'Range': request.headers.get('Range', '')}
        response = requests.get(
            pdf_url,
            headers=headers,
            stream=True,
            timeout=10
        )
        response.raise_for_status()

        # Create streaming response
        django_response = HttpResponse(
            content=response.raw,
            content_type=response.headers.get(
                'Content-Type', 'application/pdf'),
            status=response.status_code
        )
        django_response['Content-Disposition'] = f'inline; filename="document.pdf"'

        # Essential headers for PDF.js
        django_response['Accept-Ranges'] = 'bytes'
        if 'Content-Length' in response.headers:
            django_response['Content-Length'] = response.headers['Content-Length']

        return django_response

    except requests.Timeout:
        return HttpResponse('Request timeout', status=504)
    except Exception as e:
        return HttpResponseServerError(f'Error fetching PDF: {str(e)}')
