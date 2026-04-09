import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ConfirmPrompt {
  title: string;
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class ConfirmModalService {
  private readonly prompt = new BehaviorSubject<ConfirmPrompt | null>(null);
  private resolver: ((v: boolean) => void) | null = null;

  readonly prompt$ = this.prompt.asObservable();

  ask(title: string, message: string): Promise<boolean> {
    this.prompt.next({ title, message });
    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  respond(value: boolean) {
    this.resolver?.(value);
    this.resolver = null;
    this.prompt.next(null);
  }
}
