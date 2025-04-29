import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { iJournal } from '../../type/journals.type';
import { JournalService } from '../../services/journal.service';

@Component({
  selector: 'app-journals',
  standalone: true,
  templateUrl: './journals.component.html',
  imports: [RouterLink, CommonModule, FormsModule],
  styleUrls: ['./journals.component.scss'],
})
export class JournalsComponent implements OnInit {
  journals: iJournal[] = [];
  filteredJournalsList: iJournal[] = [];
  searchText: string = '';
  loading: boolean = true;

  constructor(private journalService: JournalService) {}

  ngOnInit() {
    this.journalService.getJournals().subscribe({
      next: (journals: iJournal[]) => {
        this.journals = journals;
        this.filteredJournalsList = [...this.journals];
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading journals:', error);
        this.loading = false;
      },
    });
  }

  onSearch() {
    if (!this.searchText) {
      this.filteredJournalsList = [...this.journals];
      return;
    }

    const text = this.searchText.toLowerCase();
    this.filteredJournalsList = this.journals.filter((journal) => {
      return (
        journal.volume.toString().includes(text) ||
        journal.number.toString().includes(text)
      );
    });
  }

  // This can be removed if you switch to using filteredJournalsList in template
  filteredJournals() {
    if (!this.searchText) return this.journals;
    const text = this.searchText.toLowerCase();
    return this.journals.filter((journal) =>
      `vol ${journal.volume} no ${journal.number}`.toLowerCase().includes(text)
    );
  }
}
