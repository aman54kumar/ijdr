import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  FirebaseJournalService,
  FirebaseJournal,
} from '../../../services/firebase-journal.service';

@Component({
  selector: 'app-admin-insights',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-insights.component.html',
  styleUrl: './admin-insights.component.scss',
})
export class AdminInsightsComponent implements OnInit {
  journals: FirebaseJournal[] = [];
  loading = true;

  constructor(private firebaseService: FirebaseJournalService) {}

  ngOnInit() {
    this.firebaseService.getJournals().subscribe({
      next: (list) => {
        this.journals = [...list].sort(
          (a, b) => (b.viewCount || 0) - (a.viewCount || 0)
        );
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }
}
