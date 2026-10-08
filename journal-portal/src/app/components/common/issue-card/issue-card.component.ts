import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NgClass } from '@angular/common';
import { iJournal } from '../../../type/journals.type';
import { JournalHighlightTag } from '../../../utils/journal-issue-tags.util';
import { IssueCoverComponent } from '../issue-cover/issue-cover.component';

@Component({
  selector: 'app-issue-card',
  standalone: true,
  imports: [NgClass, IssueCoverComponent],
  templateUrl: './issue-card.component.html',
  styleUrl: './issue-card.component.scss',
})
export class IssueCardComponent {
  @Input({ required: true }) issue!: iJournal;
  @Input() eager = false;
  @Input() layout: 'grid' | 'list' = 'grid';
  @Input() tags: JournalHighlightTag[] = [];
  @Output() read = new EventEmitter<iJournal>();
  @Output() copyLink = new EventEmitter<iJournal>();

  get editionLabel(): string {
    return this.issue.edition === 'July-December' ? 'Jul–Dec' : 'Jan–Jun';
  }

  get summary(): string {
    const d = this.issue.description ?? '';
    return d.length > 140 ? d.slice(0, 140).trimEnd() + '…' : d;
  }
}
