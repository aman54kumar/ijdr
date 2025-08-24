import firebase_admin
from firebase_admin import credentials, firestore, storage
import os
from django.conf import settings

# Use the firebase_key.json file directly
cred_path = os.path.join(settings.BASE_DIR, 'firebase_key.json')
cred = credentials.Certificate(cred_path)

if not firebase_admin._apps:
    firebase_admin.initialize_app(cred, {
        'storageBucket': 'ijdr-e41d4.appspot.com'
    })

db = firestore.client()
bucket = storage.bucket()
