import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { JournalService } from '../../services/journal.service';
import { iJournal } from '../../type/journals.type';

@Component({
  selector: 'app-home',
  imports: [RouterLink, CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  latestIssues: iJournal[] = [];
  constructor(private journalService: JournalService) {}

  ngOnInit(): void {
    this.journalService.getJournals().subscribe({
      next: (journals: iJournal[]) => {
        this.latestIssues = journals.slice(0, 3);
      },
      error: (error) => {
        console.error('Error loading journals:', error);
      },
    });
  }
}
