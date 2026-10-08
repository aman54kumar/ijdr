import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SubmissionFormComponent } from './submission-form/submission-form.component';

@Component({
  selector: 'app-contribute',
  imports: [CommonModule, RouterLink, SubmissionFormComponent],
  templateUrl: './contribute.component.html',
  styleUrl: './contribute.component.scss',
})
export class ContributeComponent {}
