import { Injectable, inject } from '@angular/core';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { signal } from '@angular/core';

export interface SiteRule {
  id?: string;
  keywords: string[];
  category: 'productive' | 'unproductive' | 'neutral';
  displayName: string;
}

@Injectable({ providedIn: 'root' })
export class SiteRuleService {
  private readonly rulesSignal = signal<SiteRule[]>([]);
  readonly rules = this.rulesSignal.asReadonly();

  constructor() {
    this.listenToRules();
  }

  private listenToRules() {
    const colRef = collection(db, 'site_rules');
    const q = query(colRef);
    onSnapshot(q, (snap) => {
      const rules = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      this.rulesSignal.set(rules);
    });
  }

  async addRule(rule: Omit<SiteRule, 'id'>) {
    const colRef = collection(db, 'site_rules');
    await addDoc(colRef, rule);
  }

  async deleteRule(id: string) {
    const docRef = doc(db, 'site_rules', id);
    await deleteDoc(docRef);
  }

  async updateRule(id: string, updates: Partial<SiteRule>) {
    const docRef = doc(db, 'site_rules', id);
    await updateDoc(docRef, updates);
  }

  async seedDefaultRules() {
    const rules: Omit<SiteRule, 'id'>[] = [
      // Unproductive
      { displayName: 'YouTube', category: 'unproductive', keywords: ['youtube'] },
      { displayName: 'Netflix', category: 'unproductive', keywords: ['netflix'] },
      { displayName: 'Facebook', category: 'unproductive', keywords: ['facebook'] },
      { displayName: 'Instagram', category: 'unproductive', keywords: ['instagram'] },
      { displayName: 'Twitter / X', category: 'unproductive', keywords: ['twitter', 'x.com'] },
      { displayName: 'Reddit', category: 'unproductive', keywords: ['reddit'] },
      { displayName: 'TikTok', category: 'unproductive', keywords: ['tiktok'] },
      { displayName: 'Twitch', category: 'unproductive', keywords: ['twitch'] },
      { displayName: 'Spotify', category: 'unproductive', keywords: ['spotify'] },

      // Productive
      { displayName: 'GitHub', category: 'productive', keywords: ['github'] },
      { displayName: 'GitLab', category: 'productive', keywords: ['gitlab'] },
      { displayName: 'Bitbucket', category: 'productive', keywords: ['bitbucket'] },
      { displayName: 'Stack Overflow', category: 'productive', keywords: ['stack overflow', 'stackoverflow'] },
      { displayName: 'Gmail', category: 'productive', keywords: ['gmail'] },
      { displayName: 'Google Docs', category: 'productive', keywords: ['google docs', 'docs - google'] },
      { displayName: 'Google Sheets', category: 'productive', keywords: ['google sheets', 'sheets - google'] },
      { displayName: 'Google Slides', category: 'productive', keywords: ['google slides', 'slides - google'] },
      { displayName: 'Google Meet', category: 'productive', keywords: ['google meet'] },
      { displayName: 'Notion', category: 'productive', keywords: ['notion'] },
      { displayName: 'Figma', category: 'productive', keywords: ['figma'] },
      { displayName: 'Jira', category: 'productive', keywords: ['jira'] },
      { displayName: 'Slack', category: 'productive', keywords: ['slack'] },
      { displayName: 'Microsoft Teams', category: 'productive', keywords: ['microsoft teams', 'teams - microsoft'] },
      { displayName: 'Outlook', category: 'productive', keywords: ['outlook'] },
      { displayName: 'Zoom', category: 'productive', keywords: ['zoom'] },
      { displayName: 'Claude', category: 'productive', keywords: ['claude.ai', 'claude'] },
      { displayName: 'ChatGPT', category: 'productive', keywords: ['chatgpt'] },

      // Recruitment (The new ones you asked for)
      { displayName: 'LinkedIn', category: 'productive', keywords: ['linkedin'] },
      { displayName: 'Indeed', category: 'productive', keywords: ['indeed'] },
      { displayName: 'Monster', category: 'productive', keywords: ['monster'] },
      { displayName: 'Naukri', category: 'productive', keywords: ['naukri'] },
      { displayName: 'Kforce', category: 'productive', keywords: ['kforce'] },
      { displayName: 'Dice', category: 'productive', keywords: ['dice.com', 'dice'] },
      { displayName: 'Glassdoor', category: 'productive', keywords: ['glassdoor'] },
      { displayName: 'ZipRecruiter', category: 'productive', keywords: ['ziprecruiter'] },
      { displayName: 'CareerBuilder', category: 'productive', keywords: ['careerbuilder'] },
      { displayName: 'SimplyHired', category: 'productive', keywords: ['simplyhired'] },

      // Neutral
      { displayName: 'New Tab', category: 'neutral', keywords: ['new tab', 'about:blank'] },
      { displayName: 'Google Search', category: 'neutral', keywords: ['google search', 'google -'] },
      { displayName: 'Wikipedia', category: 'neutral', keywords: ['wikipedia'] },
    ];

    if (this.rulesSignal().length > 0) {
      if (!confirm(`You already have ${this.rulesSignal().length} rules. This will add the defaults on top of them. Proceed?`)) return;
    }

    for (const r of rules) {
      await this.addRule(r);
    }
  }
}
