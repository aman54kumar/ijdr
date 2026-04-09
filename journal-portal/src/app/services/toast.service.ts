import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type ToastKind = 'success' | 'danger' | 'info' | 'warning';

export interface ToastMessage {
  body: string;
  kind: ToastKind;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private readonly messages = new Subject<ToastMessage>();

  readonly message$ = this.messages.asObservable();

  show(body: string, kind: ToastKind = 'info') {
    this.messages.next({ body, kind });
  }
}
