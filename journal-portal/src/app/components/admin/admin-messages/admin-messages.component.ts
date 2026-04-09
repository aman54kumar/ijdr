import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ContactService,
  ContactSubmission,
} from '../../../services/contact.service';

@Component({
  selector: 'app-admin-messages',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-messages.component.html',
  styleUrl: './admin-messages.component.scss',
})
export class AdminMessagesComponent implements OnInit {
  messages: ContactSubmission[] = [];
  loading = true;

  constructor(private contactService: ContactService) {}

  ngOnInit() {
    this.contactService.getSubmissions().subscribe({
      next: (list) => {
        this.messages = list;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  async markRead(m: ContactSubmission) {
    if (m.read || !m.id) {
      return;
    }
    await this.contactService.markAsRead(m.id);
    m.read = true;
  }
}
