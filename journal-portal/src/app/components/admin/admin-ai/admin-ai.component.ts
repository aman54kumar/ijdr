import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AiService, AI_OFF, aiErrorMessage } from '../../../services/ai.service';
import { ToastService } from '../../../services/toast.service';
import { AiSettings } from '../../../type/journals.type';

@Component({
  selector: 'app-admin-ai',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-ai.component.html',
})
export class AdminAiComponent implements OnInit {
  private ai = inject(AiService);
  private toast = inject(ToastService);

  settings: AiSettings = { ...AI_OFF };
  loading = true;
  saving = false;
  embedding = false;
  usage: Record<string, number> = {};
  readonly appCheckReady = this.ai.appCheckReady;

  readonly features: { key: keyof AiSettings; label: string; help: string; cap: string }[] = [
    { key: 'summaries', label: 'AI summaries', help: 'Readers can generate a plain-language summary (cached after the first time).', cap: '40/day' },
    { key: 'translation', label: 'Hindi translation', help: 'Readers can switch an article\'s title, abstract and summary to Hindi.', cap: '40/day' },
    { key: 'chat', label: 'Ask this paper', help: 'Readers can ask questions answered from one article\'s pages.', cap: '200/day, 15 per visitor' },
    { key: 'semanticSearch', label: 'Semantic search', help: 'Meaning-based search (needs article embeddings, below).', cap: '300/day, 40 per visitor' },
  ];

  async ngOnInit() {
    this.settings = await firstValueFrom(this.ai.settings$());
    this.usage = await this.ai.usageToday();
    this.loading = false;
  }

  async save() {
    this.saving = true;
    try {
      await this.ai.saveSettings(this.settings);
      this.toast.show('AI settings saved. Changes apply immediately.', 'success');
    } catch {
      this.toast.show('Could not save the AI settings.', 'danger');
    } finally {
      this.saving = false;
    }
  }

  async embed() {
    this.embedding = true;
    try {
      const r = await this.ai.adminEmbed();
      this.toast.show(`Embedded ${r.embedded} new article(s); related lists updated for ${r.related}.`, 'success');
    } catch (e) {
      this.toast.show(aiErrorMessage(e), 'danger');
    } finally {
      this.embedding = false;
    }
  }
}
