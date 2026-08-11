import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MindMap } from '../../types/graph';
import { useMyTasks, type MyTask } from '../../hooks/useMyTasks';
import { remindersApi, type Reminder } from '../../api/reminders.api';
import { ApiError } from '../../api/client';
import { PRIORITY_COLOR, statusPillStyle } from '../../constants/taskVisuals';
import { localDateKey } from '../../utils/dateKeys';
import Modal from '../common/Modal';

interface Props {
  maps: MindMap[];
  onOpenTask: (mapId: string, nodeId: string) => void;
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_VISIBLE_PER_DAY = 3;
const REMINDERS_QUERY_KEY = ['reminders'];

interface CalendarCell {
  date: Date;
  key: string;
  inCurrentMonth: boolean;
}

function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Sunday
  const gridStart = new Date(year, month, 1 - startOffset);

  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push({ date: d, key: localDateKey(d), inCurrentMonth: d.getMonth() === month });
  }
  return cells;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// The sidebar's "Calendar" page - a month grid of the same cross-project
// "my tasks" agenda TodayView shows as Overdue/Due Today lists, just laid
// out by date instead. Pure frontend for the task side: reuses useMyTasks
// (same fetch/cache as every other task-manager surface). Reminders are a
// separate, genuinely new resource (see schema.prisma's Reminder comment -
// no Map at all, 100% personal) rendered in the same grid alongside task
// pills, visually distinct (🔔, no status-pill tint) since they aren't tasks
// and have no status/project to show.
export default function CalendarView({ maps, onOpenTask }: Props) {
  const { myTasks, isLoading } = useMyTasks(maps);
  const [viewDate, setViewDate] = useState(() => new Date());
  const queryClient = useQueryClient();

  const remindersQuery = useQuery({ queryKey: REMINDERS_QUERY_KEY, queryFn: remindersApi.list });
  const reminders = remindersQuery.data ?? [];
  const invalidateReminders = () => queryClient.invalidateQueries({ queryKey: REMINDERS_QUERY_KEY });

  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(() => localDateKey(new Date()));
  const [newTime, setNewTime] = useState('09:00');
  const [newNote, setNewNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const todayKey = localDateKey(new Date());

  const tasksByDay = new Map<string, MyTask[]>();
  for (const t of myTasks) {
    if (!t.dueDate) continue;
    const key = localDateKey(new Date(t.dueDate));
    const list = tasksByDay.get(key) ?? [];
    list.push(t);
    tasksByDay.set(key, list);
  }

  const remindersByDay = new Map<string, Reminder[]>();
  for (const r of reminders) {
    const key = localDateKey(new Date(r.remindAt));
    const list = remindersByDay.get(key) ?? [];
    list.push(r);
    remindersByDay.set(key, list);
  }

  const cells = buildMonthGrid(year, month);
  const monthLabel = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const goToMonth = (delta: number) => {
    setViewDate(new Date(year, month + delta, 1));
  };

  const handleAddReminder = async () => {
    if (!newTitle.trim() || !newDate || !newTime) return;
    try {
      const remindAt = new Date(`${newDate}T${newTime}`).toISOString();
      await remindersApi.create({ title: newTitle.trim(), note: newNote.trim() || null, remindAt });
      setShowAddForm(false);
      setNewTitle('');
      setNewNote('');
      setFormError(null);
      invalidateReminders();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to add reminder');
    }
  };

  const handleDeleteReminder = async () => {
    if (!selectedReminder) return;
    try {
      await remindersApi.remove(selectedReminder.id);
      setSelectedReminder(null);
      setDeleteError(null);
      invalidateReminders();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'Failed to delete reminder');
    }
  };

  return (
    <div className="tm-page">
      <div className="maps-page-header calendar-header">
        <h1>{monthLabel}</h1>
        <div className="calendar-nav">
          <button className="action-btn primary" onClick={() => setShowAddForm(true)}>
            🔔 Add Reminder
          </button>
          <button className="action-btn" onClick={() => setViewDate(new Date())}>
            Today
          </button>
          <button className="action-btn" onClick={() => goToMonth(-1)} title="Previous month">
            ← Prev
          </button>
          <button className="action-btn" onClick={() => goToMonth(1)} title="Next month">
            Next →
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="empty-state">Loading your tasks...</div>
      ) : (
        <div className="calendar-grid">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="calendar-weekday">
              {label}
            </div>
          ))}
          {cells.map((cell) => {
            const dayTasks = tasksByDay.get(cell.key) ?? [];
            const dayReminders = (remindersByDay.get(cell.key) ?? []).sort((a, b) =>
              a.remindAt.localeCompare(b.remindAt)
            );
            const isToday = cell.key === todayKey;
            const visibleTasks = dayTasks.slice(0, MAX_VISIBLE_PER_DAY);
            const taskOverflowCount = dayTasks.length - visibleTasks.length;
            const visibleReminders = dayReminders.slice(0, MAX_VISIBLE_PER_DAY);
            const reminderOverflowCount = dayReminders.length - visibleReminders.length;
            return (
              <div
                key={cell.key}
                className={`calendar-cell${cell.inCurrentMonth ? '' : ' calendar-cell-muted'}${isToday ? ' calendar-cell-today' : ''}`}
              >
                <span className={`calendar-cell-date${isToday ? ' calendar-cell-date-today' : ''}`}>
                  {cell.date.getDate()}
                </span>
                {visibleReminders.map((r) => (
                  <div
                    key={r.id}
                    className="calendar-reminder-pill"
                    title={r.note ? `${r.title} - ${r.note}` : r.title}
                    onClick={() => setSelectedReminder(r)}
                  >
                    🔔 {formatTime(r.remindAt)} {r.title}
                  </div>
                ))}
                {reminderOverflowCount > 0 && (
                  <span className="calendar-more-text">+{reminderOverflowCount} more</span>
                )}
                {visibleTasks.map((t) => {
                  const accentColor = t.priority ? PRIORITY_COLOR[t.priority] : 'var(--border)';
                  return (
                    <div
                      key={t.id}
                      className="calendar-task-pill"
                      style={{ borderLeftColor: accentColor, ...statusPillStyle(t.statusColor ?? '#8899aa') }}
                      title={`${t.name} - ${t.mapName}`}
                      onClick={() => onOpenTask(t.mapId, t.id)}
                    >
                      {t.name}
                    </div>
                  );
                })}
                {taskOverflowCount > 0 && <span className="calendar-more-text">+{taskOverflowCount} more</span>}
              </div>
            );
          })}
        </div>
      )}

      {showAddForm && (
        <Modal title="Add Reminder" onClose={() => setShowAddForm(false)}>
          <div className="property">
            <label>Title</label>
            <input
              autoFocus
              placeholder="e.g. Wedding"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </div>
          <div className="task-field-grid">
            <div>
              <label>Date</label>
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </div>
            <div>
              <label>Time</label>
              <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
            </div>
          </div>
          <div className="property">
            <label>Note (optional)</label>
            <textarea
              placeholder="Any details to remember..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={3}
            />
          </div>
          {formError && <p className="error-text">{formError}</p>}
          <button className="action-btn primary" onClick={handleAddReminder}>
            Add Reminder
          </button>
        </Modal>
      )}

      {selectedReminder && (
        <Modal title={selectedReminder.title} onClose={() => setSelectedReminder(null)}>
          <p className="hint-text" style={{ margin: 0 }}>
            {new Date(selectedReminder.remindAt).toLocaleString(undefined, {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            })}
          </p>
          {selectedReminder.note && <p style={{ whiteSpace: 'pre-wrap' }}>{selectedReminder.note}</p>}
          {selectedReminder.notifiedAt && <p className="hint-text">Already reminded.</p>}
          {deleteError && <p className="error-text">{deleteError}</p>}
          <button className="action-btn danger" onClick={handleDeleteReminder}>
            🗑 Delete
          </button>
        </Modal>
      )}
    </div>
  );
}
