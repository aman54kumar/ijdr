import { Injectable, inject } from '@angular/core';
import { Auth } from '@angular/fire/auth';
import { Firestore, Timestamp, addDoc, collection, collectionData, limit, orderBy, query } from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { AuditEntry } from '../type/journals.type';

/** Append-only record of admin actions (publish, unpublish, delete, status changes). */
@Injectable({ providedIn: 'root' })
export class AuditService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);

  /** Best effort: a failed audit write never blocks the action itself. */
  async log(entry: Omit<AuditEntry, 'id' | 'actorUid' | 'actorEmail' | 'at'>): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;
    try {
      await addDoc(collection(this.firestore, 'auditLog'), {
        ...entry,
        actorUid: user.uid,
        actorEmail: user.email ?? '',
        at: Timestamp.now(),
      });
    } catch (e) {
      console.warn('Audit log write failed', e);
    }
  }

  recent(max = 50): Observable<AuditEntry[]> {
    return collectionData(query(collection(this.firestore, 'auditLog'), orderBy('at', 'desc'), limit(max)), {
      idField: 'id',
    }) as Observable<AuditEntry[]>;
  }
}
