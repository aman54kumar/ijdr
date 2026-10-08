import { Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  addDoc,
  query,
  orderBy,
  collectionData,
  doc,
  updateDoc,
  Timestamp,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  message: string;
  read: boolean;
  /** Missing on older messages: derived from `read`. */
  status?: 'new' | 'handled';
  triage?: {
    category: string;
    priority: 'low' | 'normal' | 'high';
    summary: string;
    replyDraft: string;
    model?: string;
  };
  createdAt: Timestamp;
}

export const contactStatus = (m: Pick<ContactSubmission, 'status' | 'read'>): 'new' | 'handled' =>
  m.status ?? (m.read ? 'handled' : 'new');

@Injectable({
  providedIn: 'root',
})
export class ContactService {
  constructor(private firestore: Firestore) {}

  async submitMessage(
    name: string,
    email: string,
    message: string
  ): Promise<void> {
    await addDoc(collection(this.firestore, 'contactSubmissions'), {
      name: name.trim(),
      email: email.trim(),
      message: message.trim(),
      read: false,
      createdAt: Timestamp.now(),
    });
  }

  getSubmissions(): Observable<ContactSubmission[]> {
    const ref = collection(this.firestore, 'contactSubmissions');
    return collectionData(query(ref, orderBy('createdAt', 'desc')), {
      idField: 'id',
    }) as Observable<ContactSubmission[]>;
  }

  async markAsRead(id: string): Promise<void> {
    await this.setStatus(id, 'handled');
  }

  async setStatus(id: string, status: 'new' | 'handled'): Promise<void> {
    await updateDoc(doc(this.firestore, 'contactSubmissions', id), {
      status,
      read: status === 'handled',
    });
  }
}
