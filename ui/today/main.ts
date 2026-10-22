import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps';

import type { SlotStatus } from '../../src/domain/schedule.ts';

interface TodayPlan {
  date: string;
  dateLabel: string;
  parentName: string;
  doses: { medication: string; dosage: string; timeLabel: string; status: SlotStatus }[];
  toConfirm: { medication: string; label: string }[];
  reminders: { dateLabel: string; content: string }[];
  checkin: { mood: number; sleep: string; ateWell: boolean } | null;
  lowSupply: { medication: string; daysLeft: number }[];
}

const STATUS_LABELS: Record<SlotStatus, string> = {
  taken: 'Taken',
  skipped: 'Skipped',
  unconfirmed: 'Not confirmed',
  due: 'Due now',
  upcoming: 'Later',
};

const MOODS = ['', 'Very low', 'Low', 'Okay', 'Good', 'Great'];

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function byId(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id} in the today view`);
  return node;
}

function row(
  primary: string,
  secondary: string,
  chip?: { text: string; tone: string },
): HTMLLIElement {
  const item = element('li');
  const label = element('div', primary);
  label.append(element('div', secondary, 'detail'));
  item.append(label);
  if (chip) item.append(element('span', chip.text, `chip ${chip.tone}`));
  return item;
}

function greetingFor(parentName: string): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${parentName}`;
}

function render(plan: TodayPlan): void {
  byId('greeting').textContent = greetingFor(plan.parentName);
  byId('date').textContent = plan.dateLabel;

  const doses = byId('doses');
  doses.replaceChildren(
    ...(plan.doses.length
      ? plan.doses.map((dose) =>
          row(`${dose.medication} ${dose.dosage}`, dose.timeLabel, {
            text: STATUS_LABELS[dose.status],
            tone: dose.status,
          }),
        )
      : [element('li', 'No medicines today.', 'empty')]),
  );

  byId('confirm-section').hidden = plan.toConfirm.length === 0;
  byId('confirm').replaceChildren(
    ...plan.toConfirm.map((dose) =>
      row(dose.medication, dose.label, { text: 'Did you take it?', tone: 'unconfirmed' }),
    ),
  );

  byId('reminders-section').hidden = plan.reminders.length === 0;
  byId('reminders').replaceChildren(
    ...plan.reminders.map((reminder) => row(reminder.content, reminder.dateLabel)),
  );

  const checkin = byId('checkin');
  if (plan.checkin) {
    checkin.className = '';
    checkin.textContent = `Mood: ${MOODS[plan.checkin.mood] ?? String(plan.checkin.mood)} · Sleep: ${plan.checkin.sleep} · ${plan.checkin.ateWell ? 'Eating well' : 'Needs a proper meal'}`;
  } else {
    checkin.className = 'empty';
    checkin.textContent = 'Not done yet.';
  }

  byId('supply-section').hidden = plan.lowSupply.length === 0;
  byId('supply').replaceChildren(
    ...plan.lowSupply.map((item) =>
      row(item.medication, `About ${String(item.daysLeft)} days left`, {
        text: 'Reorder',
        tone: 'calm',
      }),
    ),
  );
}

function applyHostContext(context: McpUiHostContext | undefined): void {
  if (context?.theme) applyDocumentTheme(context.theme);
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context?.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
}

const app = new App({ name: 'Kin today card', version: '0.1.0' });

app.addEventListener('toolresult', (result) => {
  if (result.structuredContent) render(result.structuredContent as unknown as TodayPlan);
});
app.addEventListener('hostcontextchanged', applyHostContext);

await app.connect();
applyHostContext(app.getHostContext());
