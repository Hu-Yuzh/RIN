import { useEffect, useMemo, useState } from "react";
import { categories } from "./data/categories";
import { holidays } from "./data/holidays";
import { addDays, friendlyDate, monthCells, pad, parseDateKey, sameDay, toDateKey } from "./lib/date";
import { backupRepository, createBackup, parseBackup, type RiheBackup } from "./repositories/backupRepository";
import { todoRepository } from "./repositories/todoRepository";
import { defaultSettings, settingsRepository } from "./repositories/settingsRepository";
import { getWeather, searchCities, weatherIcon, type CitySearchResult } from "./services/weather";
import type { AppSettings, CategoryKey, Todo, ViewMode, WeatherDay } from "./types";

const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
const weekdayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const uid = () => globalThis.crypto?.randomUUID?.() || `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
let appBootstrapped = false;

function createTodo(title: string, date: string | null, category: CategoryKey, time = ""): Todo {
  const now = new Date().toISOString();
  return { id: uid(), title, notes: "", date, time, category, done: false, createdAt: now, updatedAt: now };
}

function seedTodos(today: Date) {
  return [
    createTodo("完成桌面端迁移", toDateKey(today), "work", "10:30"),
    createTodo("整理下一阶段开发清单", toDateKey(today), "study"),
    createTodo("傍晚散步", toDateKey(addDays(today, 1)), "life", "18:40"),
    createTodo("记录灵感与想法", null, "personal"),
  ];
}

type EditorState = { todo?: Todo; date?: string } | null;

export default function App() {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(new Date(today));
  const [selectedDate, setSelectedDate] = useState(new Date(today));
  const [view, setView] = useState<ViewMode>("month");
  const [todos, setTodos] = useState<Todo[]>([]);
  const [weather, setWeather] = useState<Record<string, WeatherDay>>({});
  const [weatherStatus, setWeatherStatus] = useState("正在更新天气");
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [sort, setSort] = useState<"date" | "category">("date");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [spotlight, setSpotlight] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [calendarCollapsed, setCalendarCollapsed] = useState(true);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const [ready, setReady] = useState(false);
  const dark = settings.theme === "dark" || (settings.theme === "system" && systemDark);

  useEffect(() => {
    if (appBootstrapped) return;
    appBootstrapped = true;
    void (async () => {
      try {
        const loadedSettings = await settingsRepository.load();
        setSettings(loadedSettings);
        setFilter(loadedSettings.showCompletedByDefault ? "all" : "open");
        setSort(loadedSettings.defaultSort);
        let loaded = await todoRepository.list();
        if (!loaded.length) {
          loaded = seedTodos(today);
          await Promise.all(loaded.map((todo) => todoRepository.save(todo)));
        }
        setTodos(loaded);
        void backupRepository.auto(createBackup(loaded, loadedSettings)).catch(() => undefined);
      } finally { setReady(true); }
    })();
  }, [today]);

  useEffect(() => {
    if (!ready || !settings.showWeather) { setWeather({}); return; }
    let active = true;
    setWeather({}); setWeatherStatus("正在更新天气");
    void getWeather(settings.weatherLocation)
      .then((data) => { if (active) { setWeather(data); setWeatherStatus("未来 16 天"); } })
      .catch(() => { if (active) setWeatherStatus("天气暂不可用"); });
    return () => { active = false; };
  }, [ready, settings.showWeather, settings.weatherLocation.latitude, settings.weatherLocation.longitude, settings.weatherLocation.timezone]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("dark", dark);
    document.body.classList.toggle("custom-background", Boolean(settings.backgroundImage));
    document.body.classList.toggle("reduce-motion", settings.reduceMotion);
    document.body.style.backgroundImage = settings.backgroundImage ? `url("${settings.backgroundImage}")` : "";
    document.body.style.backgroundSize = settings.backgroundImage ? "cover" : "";
    document.body.style.backgroundPosition = settings.backgroundImage ? "center" : "";
    document.body.style.backgroundAttachment = settings.backgroundImage ? "fixed" : "";
    document.body.style.setProperty("--background-mask", String(settings.backgroundMask));
    document.body.style.setProperty("--panel-visibility", `${Math.round((1 - settings.backgroundVisibility) * 100)}%`);
    if (settings.fontColor) document.body.style.setProperty("--text", settings.fontColor); else document.body.style.removeProperty("--text");
    if (settings.mutedColor) document.body.style.setProperty("--muted", settings.mutedColor); else document.body.style.removeProperty("--muted");
    if (settings.accentColor) document.body.style.setProperty("--accent", settings.accentColor); else document.body.style.removeProperty("--accent");
  }, [dark, settings]);

  function commitSettings(next: AppSettings) {
    setSettings(next);
    setFilter(next.showCompletedByDefault ? "all" : "open");
    setSort(next.defaultSort);
    void settingsRepository.save(next);
    setSettingsOpen(false);
  }

  async function exportData() {
    return backupRepository.export(createBackup(todos, settings));
  }

  async function importData(backup: RiheBackup, mode: "merge" | "replace") {
    await backupRepository.auto(createBackup(todos, settings), true);
    if (mode === "replace") {
      await todoRepository.replaceAll(backup.todos);
      await settingsRepository.save(backup.settings);
      setSettings(backup.settings);
    } else {
      await todoRepository.mergeAll(backup.todos);
    }
    const restored = await todoRepository.list();
    setTodos(restored);
    return mode === "replace" ? `已恢复 ${restored.length} 项待办与全部设置` : `导入完成，当前共有 ${restored.length} 项待办`;
  }

  const visibleTodos = useMemo(() => todos.filter((todo) => {
    if (filter === "open" && todo.done) return false;
    if (!query) return true;
    const needle = query.toLocaleLowerCase("zh-CN");
    return [todo.title, todo.notes, categories[todo.category].name].some((value) => value.toLocaleLowerCase("zh-CN").includes(needle));
  }), [todos, filter, query]);

  const periodTitle = view === "year" ? `${cursor.getFullYear()}年` : view === "day"
    ? `${cursor.getFullYear()}年${cursor.getMonth() + 1}月${cursor.getDate()}日`
    : `${cursor.getFullYear()}年 ${pad(cursor.getMonth() + 1)}月`;

  function changePeriod(amount: number) {
    if (view === "year") setCursor(new Date(cursor.getFullYear() + amount, 0, 1));
    else if (view === "day") setCursor(addDays(cursor, amount));
    else setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + amount, 1));
  }

  async function saveTodo(todo: Todo) {
    await todoRepository.save(todo);
    setTodos((items) => items.some((item) => item.id === todo.id) ? items.map((item) => item.id === todo.id ? todo : item) : [...items, todo]);
    setEditor(null);
  }

  async function toggleTodo(todo: Todo) {
    const updated = { ...todo, done: !todo.done, updatedAt: new Date().toISOString() };
    await todoRepository.save(updated);
    setTodos((items) => items.map((item) => item.id === todo.id ? updated : item));
  }

  async function deleteTodo(todo: Todo) {
    await todoRepository.remove(todo.id);
    setTodos((items) => items.filter((item) => item.id !== todo.id));
    setEditor(null);
  }

  function focusTodo(todo: Todo | null) {
    if (!settings.hoverDateFocus) return;
    if (view === "day") { setSpotlight(null); return; }
    if (!todo?.date) { setSpotlight(null); return; }
    const date = parseDateKey(todo.date);
    setSpotlight(todo.date);
    if (view !== "month" || date.getMonth() !== cursor.getMonth() || date.getFullYear() !== cursor.getFullYear()) {
      setView("month"); setCursor(date);
    }
  }

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const typing = ["INPUT", "TEXTAREA"].includes((document.activeElement?.tagName || ""));
      if (event.key === "Escape") setEditor(null);
      if (!typing && event.key.toLowerCase() === "n") setEditor({ date: toDateKey(selectedDate) });
      if (!typing && event.key.toLowerCase() === "t") { setCursor(new Date(today)); setSelectedDate(new Date(today)); }
      if (!typing && (event.key === "/" || (event.ctrlKey && event.key.toLowerCase() === "k"))) { event.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedDate, today]);

  return <div className="app-shell">
    <header className={`topbar ${calendarCollapsed ? "is-collapsed" : ""}`}>
      <div className="brand"><span className="brand-mark"><img src="/rin-icon.png" alt="" /></span><span>铃RIN</span></div>
      <nav className="period-nav">
        <button className="icon-button" onClick={() => changePeriod(-1)} aria-label="上一个时间段">‹</button>
        <button className="period-title" onClick={() => { setCursor(new Date(today)); setSelectedDate(new Date(today)); }}>{periodTitle}</button>
        <button className="icon-button" onClick={() => changePeriod(1)} aria-label="下一个时间段">›</button>
      </nav>
      <div className="top-actions">
        <div className="view-switcher">{(["year", "month", "day"] as ViewMode[]).map((item) => <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{{ year: "年", month: "月", day: "日" }[item]}</button>)}</div>
        <button className="text-button today-button" onClick={() => { setCursor(new Date(today)); setSelectedDate(new Date(today)); }}>今天</button>
        <button className="icon-button search-trigger" onClick={() => setSearchOpen((value) => !value)} aria-label="搜索">⌕</button>
        <button className="icon-button theme-trigger" onClick={() => commitSettings({ ...settings, theme: dark ? "light" : "dark" })} aria-label="切换主题">{dark ? "☀" : "☾"}</button>
        <button className="icon-button settings-trigger" onClick={() => setSettingsOpen(true)} aria-label="设置">⚙</button>
        <button className={`collapse-button ${calendarCollapsed ? "expand" : ""}`} onClick={() => setCalendarCollapsed((value) => !value)} aria-label={calendarCollapsed ? "展开日历" : "收纳日历"}><i>{calendarCollapsed ? "▣" : "◧"}</i><span>{calendarCollapsed ? "展开日历" : "收纳日历"}</span></button>
      </div>
    </header>

    <main className={`workspace ${calendarCollapsed ? "collapsed" : "expanded"}`}>
      <section className="calendar-panel">
        <div className="calendar-status"><span>{settings.showWeather && <><i className="location-dot" />{settings.weatherLocation.name} <em>{weatherStatus}</em></>}</span>{settings.showCategoryLegend && <span className="legend">{Object.entries(categories).slice(0, 3).map(([key, value]) => <span key={key}><i style={{ background: value.color }} />{value.name}</span>)}</span>}</div>
        <div className="calendar-root">
          {view === "month" && <MonthView cursor={cursor} today={today} selectedDate={selectedDate} todos={todos} weather={weather} spotlight={spotlight} settings={settings} onSelect={(date) => { setSelectedDate(date); setCursor(date); setView("day"); }} />}
          {view === "year" && <YearView cursor={cursor} today={today} todos={todos} onSelect={(date) => { setCursor(date); setSelectedDate(date); setView("month"); }} />}
          {view === "day" && <DayView cursor={cursor} todos={todos} weather={weather} settings={settings} onBack={() => setView("month")} onAdd={() => setEditor({ date: toDateKey(cursor) })} onEdit={(todo) => setEditor({ todo })} />}
        </div>
      </section>

      <aside className="todo-panel">
        <div className="todo-heading"><div><p className="eyebrow">所有事项</p><h1>待办清单 <small>{todos.filter((todo) => !todo.done).length} 项未完成</small></h1></div><button className="add-button" onClick={() => setEditor({ date: toDateKey(selectedDate) })}>＋</button></div>
        <div className="todo-toolbar"><div className="segmented"><button className={filter === "open" ? "active" : ""} onClick={() => setFilter("open")}>未完成</button><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>全部</button></div><button className="sort-button" onClick={() => setSort((value) => value === "date" ? "category" : "date")}>{sort === "date" ? "按日期" : "按类别"}⌄</button></div>
        {searchOpen && <div className="search-box"><span>⌕</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、备注或分类"/><button onClick={() => { setQuery(""); setSearchOpen(false); }}>×</button></div>}
        <TodoList todos={visibleTodos} sort={sort} ready={ready} onHover={focusTodo} onToggle={toggleTodo} onEdit={(todo) => setEditor({ todo })} />
        <div className="quick-add"><button onClick={() => setEditor({})}>＋ 添加无日期事项</button><p><kbd>N</kbd> 新建 · <kbd>T</kbd> 今天 · <kbd>/</kbd> 搜索</p></div>
      </aside>
    </main>
    {editor && <TodoEditor state={editor} onClose={() => setEditor(null)} onSave={saveTodo} onDelete={deleteTodo} />}
    {settingsOpen && <SettingsPanel settings={settings} onClose={() => setSettingsOpen(false)} onSave={commitSettings} onExport={exportData} onImport={importData} />}
  </div>;
}

function MonthView({ cursor, today, selectedDate, todos, weather, spotlight, settings, onSelect }: { cursor: Date; today: Date; selectedDate: Date; todos: Todo[]; weather: Record<string, WeatherDay>; spotlight: string | null; settings: AppSettings; onSelect: (date: Date) => void }) {
  return <div className="month-view"><div className="weekday-row">{weekdays.map((day) => <span key={day}>{day}</span>)}</div><div className="month-grid">{monthCells(cursor).map((date) => {
    const key = toDateKey(date); const isOtherMonth = date.getMonth() !== cursor.getMonth(); const dayTodos = todos.filter((todo) => todo.date === key); const holiday = settings.showHolidays ? holidays[key] : undefined; const forecast = settings.showWeather ? weather[key] : undefined;
    if (isOtherMonth && !settings.showAdjacentDates) return <span className="day-cell other-month hidden-date" key={key} />;
    const classes = ["day-cell", isOtherMonth ? "other-month" : "", sameDay(date, today) ? "today" : "", sameDay(date, selectedDate) ? "selected" : "", spotlight === key ? "spotlight" : "", holiday?.type === "holiday" ? "holiday" : ""].filter(Boolean).join(" ");
    return <button key={key} className={classes} onClick={() => onSelect(date)}>
      <span className="cell-top"><span className="date-heading"><b>{date.getDate()}</b>{holiday && <em className={holiday.type}>{holiday.label}</em>}</span>{forecast && <span className="weather"><i>{weatherIcon(forecast.code)}</i>{Math.round(forecast.max)}°</span>}</span>
      <span className="cell-todos">{dayTodos.slice(0, 2).map((todo) => <span key={todo.id} className={`cell-todo ${todo.done ? "done" : ""}`}><i style={{ background: categories[todo.category].color }} />{todo.title}</span>)}{dayTodos.length > 2 && <small>+{dayTodos.length - 2}</small>}</span>
    </button>;
  })}</div></div>;
}

function YearView({ cursor, today, todos, onSelect }: { cursor: Date; today: Date; todos: Todo[]; onSelect: (date: Date) => void }) {
  return <div className="year-view">{Array.from({ length: 12 }, (_, month) => {
    const monthDate = new Date(cursor.getFullYear(), month, 1);
    return <button className="mini-month" key={month} onClick={() => onSelect(monthDate)}><strong>{month + 1}月</strong><span className="mini-grid">{monthCells(monthDate).map((date) => date.getMonth() === month ? <i key={toDateKey(date)} className={`${sameDay(date, today) ? "today" : ""} ${todos.some((todo) => todo.date === toDateKey(date) && !todo.done) ? "has-task" : ""}`}>{date.getDate()}</i> : <i key={toDateKey(date)} />)}</span></button>;
  })}</div>;
}

function DayView({ cursor, todos, weather, settings, onBack, onAdd, onEdit }: { cursor: Date; todos: Todo[]; weather: Record<string, WeatherDay>; settings: AppSettings; onBack: () => void; onAdd: () => void; onEdit: (todo: Todo) => void }) {
  const key = toDateKey(cursor); const holiday = settings.showHolidays ? holidays[key] : undefined; const forecast = settings.showWeather ? weather[key] : undefined; const dayTodos = todos.filter((todo) => todo.date === key).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  return <div className="day-view"><button className="back-button" onClick={onBack}>← 返回月历</button><section className="day-card"><div><p>{cursor.getFullYear()} · {pad(cursor.getMonth() + 1)}{holiday ? ` · ${holiday.name}` : ""}</p><strong>{pad(cursor.getDate())}</strong><span>{weekdayNames[cursor.getDay()]}{holiday?.type === "workday" ? " · 调休上班" : ""}</span></div>{forecast ? <div className="day-weather"><b>{weatherIcon(forecast.code)}</b><span>{Math.round(forecast.min)}° – {Math.round(forecast.max)}°<small>{settings.weatherLocation.name}</small></span></div> : <small>天气暂无数据</small>}</section><section className="day-agenda"><header><div><p className="eyebrow">当日安排</p><h2>{dayTodos.length ? `${dayTodos.length} 件事项` : "保持轻盈的一天"}</h2></div><button className="add-button" onClick={onAdd}>＋</button></header>{dayTodos.length ? dayTodos.map((todo) => <button className="agenda-item" key={todo.id} onClick={() => onEdit(todo)}><time>{todo.time || "全天"}</time><i style={{ background: categories[todo.category].color }} /><span>{todo.title}</span></button>) : <div className="day-empty">还没有安排，给今天留一点空间。</div>}</section></div>;
}

function TodoList({ todos, sort, ready, onHover, onToggle, onEdit }: { todos: Todo[]; sort: "date" | "category"; ready: boolean; onHover: (todo: Todo | null) => void; onToggle: (todo: Todo) => void; onEdit: (todo: Todo) => void }) {
  const groups = new Map<string, Todo[]>();
  [...todos].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999") || (a.time || "99:99").localeCompare(b.time || "99:99")).forEach((todo) => {
    const key = sort === "date" ? todo.date || "undated" : todo.category;
    groups.set(key, [...(groups.get(key) || []), todo]);
  });
  if (!ready) return <div className="empty-state">正在读取本地数据…</div>;
  if (!todos.length) return <div className="empty-state"><b>✓</b><span>这里已经清空了</span></div>;
  return <div className="todo-list">{[...groups].map(([key, items]) => <section className="todo-group" key={key}><h2>{sort === "category" && <i style={{ background: categories[key as CategoryKey].color }} />}{sort === "category" ? categories[key as CategoryKey].name : key === "undated" ? "无日期" : friendlyDate(key)}</h2>{items.map((todo) => <article className={`todo-item ${todo.done ? "done" : ""}`} key={todo.id} onMouseEnter={() => onHover(todo)} onMouseLeave={() => onHover(null)} onClick={() => onEdit(todo)} style={{ "--category": categories[todo.category].color } as React.CSSProperties}><button className="check" onClick={(event) => { event.stopPropagation(); void onToggle(todo); }}>{todo.done ? "✓" : ""}</button><span><strong>{todo.title}</strong><small>{sort === "category" ? `${friendlyDate(todo.date)}${todo.time ? ` · ${todo.time}` : ""}` : `${categories[todo.category].name}${todo.time ? ` · ${todo.time}` : ""}`}</small></span><i className="category-bar" /></article>)}</section>)}</div>;
}

function TodoEditor({ state, onClose, onSave, onDelete }: { state: NonNullable<EditorState>; onClose: () => void; onSave: (todo: Todo) => Promise<void>; onDelete: (todo: Todo) => Promise<void> }) {
  const original = state.todo;
  const [title, setTitle] = useState(original?.title || ""); const [date, setDate] = useState(original?.date || state.date || ""); const [time, setTime] = useState(original?.time || ""); const [notes, setNotes] = useState(original?.notes || ""); const [category, setCategory] = useState<CategoryKey>(original?.category || "work");
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!title.trim()) return;
    const now = new Date().toISOString();
    await onSave({ id: original?.id || uid(), title: title.trim(), notes: notes.trim(), date: date || null, time: date ? time : "", category, done: original?.done || false, createdAt: original?.createdAt || now, updatedAt: now });
  }
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="editor-modal"><header><div><p className="eyebrow">{original ? "编辑事项" : date ? friendlyDate(date) : "无日期事项"}</p><h2>{original ? "调整这件事" : "安排一件事"}</h2></div><button onClick={onClose}>×</button></header><form onSubmit={submit}><label>事项<input autoFocus value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} placeholder="例如：完成桌面端迁移" /></label><div className="field-row"><label>日期<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label><label>时间<input type="time" value={time} disabled={!date} onChange={(event) => setTime(event.target.value)} /></label></div><fieldset><legend>分类</legend><div>{(Object.keys(categories) as CategoryKey[]).map((key) => <label className={`category-option ${category === key ? "active" : ""}`} key={key} style={{ "--category": categories[key].color } as React.CSSProperties}><input type="radio" checked={category === key} onChange={() => setCategory(key)} /><i />{categories[key].name}</label>)}</div></fieldset><label>备注<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="补充一些细节（可选）" /></label><footer>{original && <button type="button" className="danger" onClick={() => void onDelete(original)}>删除</button>}<span /><button type="button" className="secondary" onClick={onClose}>取消</button><button className="primary" type="submit">保存事项</button></footer></form></section></div>;
}

async function prepareBackground(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件");
  if (file.size > 12 * 1024 * 1024) throw new Error("图片请不要超过 12 MB");
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("无法读取图片"));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("无法解析图片"));
    element.src = source;
  });
  const scale = Math.min(1, 1920 / image.width, 1200 / image.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/webp", 0.84);
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const sat = saturation / 100; const light = lightness / 100;
  const chroma = (1 - Math.abs(2 * light - 1)) * sat;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1)); const offset = light - chroma / 2;
  const [red, green, blue] = hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return `#${[red, green, blue].map((value) => Math.round((value + offset) * 255).toString(16).padStart(2, "0")).join("")}`;
}

async function paletteFromBackground(source: string): Promise<Pick<AppSettings, "theme" | "fontColor" | "mutedColor" | "accentColor" | "backgroundMask" | "backgroundVisibility">> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("无法分析背景图片"));
    element.src = source;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 64; canvas.height = 64;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context?.drawImage(image, 0, 0, 64, 64);
  const pixels = context?.getImageData(0, 0, 64, 64).data;
  if (!pixels) throw new Error("无法读取背景颜色");
  let red = 0; let green = 0; let blue = 0; let count = 0;
  for (let index = 0; index < pixels.length; index += 16) {
    if (pixels[index + 3] < 100) continue;
    red += pixels[index]; green += pixels[index + 1]; blue += pixels[index + 2]; count += 1;
  }
  if (!count) return { theme: "light", fontColor: "#20251f", mutedColor: "#626960", accentColor: "#506c5e", backgroundMask: 0.58, backgroundVisibility: 0.52 };
  red = Math.round(red / count); green = Math.round(green / count); blue = Math.round(blue / count);
  const max = Math.max(red, green, blue) / 255; const min = Math.min(red, green, blue) / 255;
  const lightness = (max + min) / 2; const delta = max - min;
  let hue = 145;
  if (delta) {
    if (max === red / 255) hue = 60 * (((green - blue) / 255 / delta) % 6);
    else if (max === green / 255) hue = 60 * ((blue - red) / 255 / delta + 2);
    else hue = 60 * ((red - green) / 255 / delta + 4);
    if (hue < 0) hue += 360;
  }
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  const darkBackground = luminance < 0.52;
  const accentHue = saturation < 0.12 ? 145 : (hue + 150) % 360;
  const accentSaturation = saturation < 0.12 ? 28 : Math.min(58, Math.max(34, saturation * 100));
  const accentLightness = darkBackground ? 70 : 38;
  return {
    theme: darkBackground ? "dark" : "light",
    fontColor: darkBackground ? "#f4f6f2" : "#20251f",
    mutedColor: darkBackground ? "#c1c8bf" : "#626960",
    accentColor: hslToHex(accentHue, accentSaturation, accentLightness),
    backgroundMask: darkBackground ? 0.5 : 0.58,
    backgroundVisibility: 0.52,
  };
}

function SettingsPanel({ settings, onClose, onSave, onExport, onImport }: { settings: AppSettings; onClose: () => void; onSave: (settings: AppSettings) => void; onExport: () => Promise<string>; onImport: (backup: RiheBackup, mode: "merge" | "replace") => Promise<string> }) {
  const [draft, setDraft] = useState(settings);
  const [imageError, setImageError] = useState("");
  const [adapting, setAdapting] = useState(false);
  const [dataStatus, setDataStatus] = useState("");
  const [dataBusy, setDataBusy] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<RiheBackup | null>(null);
  const [cityQuery, setCityQuery] = useState(settings.weatherLocation.name);
  const [cityResults, setCityResults] = useState<CitySearchResult[]>([]);
  const [cityStatus, setCityStatus] = useState("");
  const [citySearching, setCitySearching] = useState(false);
  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => setDraft((current) => ({ ...current, [key]: value }));
  async function chooseBackground(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try { setImageError(""); update("backgroundImage", await prepareBackground(file)); }
    catch (error) { setImageError(error instanceof Error ? error.message : "图片导入失败"); }
    event.target.value = "";
  }
  async function adaptToBackground() {
    if (!draft.backgroundImage) return;
    try {
      setImageError(""); setAdapting(true);
      const palette = await paletteFromBackground(draft.backgroundImage);
      setDraft((current) => ({ ...current, ...palette }));
    } catch (error) { setImageError(error instanceof Error ? error.message : "自动配色失败"); }
    finally { setAdapting(false); }
  }
  async function exportBackup() {
    try {
      setDataBusy(true); setDataStatus("");
      const path = await onExport();
      setDataStatus(`备份已导出至：${path}`);
    } catch (error) { setDataStatus(error instanceof Error ? error.message : "备份导出失败"); }
    finally { setDataBusy(false); }
  }
  async function chooseBackup(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setDataStatus("");
      const backup = parseBackup(await file.text());
      setPendingBackup(backup);
    } catch (error) { setPendingBackup(null); setDataStatus(error instanceof Error ? error.message : "备份读取失败"); }
    event.target.value = "";
  }
  async function restoreBackup(mode: "merge" | "replace") {
    if (!pendingBackup) return;
    try {
      setDataBusy(true); setDataStatus("");
      const message = await onImport(pendingBackup, mode);
      setDataStatus(message); setPendingBackup(null);
      if (mode === "replace") onClose();
    } catch (error) { setDataStatus(error instanceof Error ? error.message : "备份恢复失败，原数据已保留"); }
    finally { setDataBusy(false); }
  }
  async function findCities() {
    try {
      setCitySearching(true); setCityStatus(""); setCityResults([]);
      const results = await searchCities(cityQuery);
      setCityResults(results);
      if (!results.length) setCityStatus("没有找到匹配城市，请尝试加入省份或国家名称");
    } catch (error) { setCityStatus(error instanceof Error ? error.message : "城市搜索失败"); }
    finally { setCitySearching(false); }
  }
  function selectCity(city: CitySearchResult) {
    update("weatherLocation", city);
    setCityQuery(city.name); setCityResults([]); setCityStatus("");
  }
  const toggles: Array<{ key: keyof AppSettings; title: string; detail: string }> = [
    { key: "showWeather", title: "天气与气温", detail: "在月历和日期页显示未来天气" },
    { key: "showHolidays", title: "节假日标记", detail: "显示节日、假期和调休信息" },
    { key: "showAdjacentDates", title: "相邻月份日期", detail: "在月视图中保留前后月份的日期" },
    { key: "showCategoryLegend", title: "分类图例", detail: "在日历上方显示常用分类" },
    { key: "hoverDateFocus", title: "悬停联动", detail: "悬停右侧待办时定位并高亮日期" },
    { key: "showCompletedByDefault", title: "默认显示已完成", detail: "启动后在待办栏显示所有事项" },
    { key: "reduceMotion", title: "减少动态效果", detail: "关闭滑动、悬停位移等动画" },
  ];
  return <div className="modal-backdrop settings-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="settings-modal">
      <header className="settings-header"><div><p className="eyebrow">偏好设置</p><h2>让铃RIN更像你的日历</h2></div><button onClick={onClose}>×</button></header>
      <div className="settings-content">
        <section className="settings-section"><div className="settings-section-title"><span>显示内容</span><small>按需要保持页面简洁</small></div><div className="settings-card">{toggles.slice(0, 4).map((item) => <label className="setting-row" key={item.key}><span><strong>{item.title}</strong><small>{item.detail}</small></span><input type="checkbox" checked={Boolean(draft[item.key])} onChange={(event) => update(item.key, event.target.checked as never)} /><i /></label>)}<div className="city-setting"><div className="city-heading"><span><strong>天气城市</strong><small>当前：{draft.weatherLocation.name}{draft.weatherLocation.admin1 && draft.weatherLocation.admin1 !== draft.weatherLocation.name ? ` · ${draft.weatherLocation.admin1}` : ""}</small></span><em>{draft.weatherLocation.country}</em></div><div className="city-search"><input value={cityQuery} onChange={(event) => setCityQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void findCities(); }} placeholder="搜索城市，如：杭州"/><button disabled={citySearching} onClick={() => void findCities()}>{citySearching ? "搜索中…" : "搜索"}</button></div>{cityResults.length > 0 && <div className="city-results">{cityResults.map((city) => <button key={`${city.id}-${city.latitude}`} onClick={() => selectCity(city)}><span><strong>{city.name}</strong><small>{[city.admin1, city.country].filter(Boolean).join(" · ")}</small></span><em>选择</em></button>)}</div>}{cityStatus && <p className="city-status">{cityStatus}</p>}</div></div></section>
        <section className="settings-section"><div className="settings-section-title"><span>交互偏好</span><small>控制默认行为</small></div><div className="settings-card">{toggles.slice(4).map((item) => <label className="setting-row" key={item.key}><span><strong>{item.title}</strong><small>{item.detail}</small></span><input type="checkbox" checked={Boolean(draft[item.key])} onChange={(event) => update(item.key, event.target.checked as never)} /><i /></label>)}<div className="setting-row select-row"><span><strong>待办默认排序</strong><small>进入应用时使用的排列方式</small></span><select value={draft.defaultSort} onChange={(event) => update("defaultSort", event.target.value as AppSettings["defaultSort"])}><option value="date">按日期</option><option value="category">按类别</option></select></div></div></section>
        <section className="settings-section"><div className="settings-section-title"><span>外观个性化</span><small>颜色仅影响界面，不改变分类色</small></div><div className="settings-card appearance-card"><div className="appearance-row"><span><strong>主题模式</strong><small>可跟随 Windows 外观</small></span><div className="theme-options">{(["system", "light", "dark"] as const).map((mode) => <button className={draft.theme === mode ? "active" : ""} key={mode} onClick={() => update("theme", mode)}>{{ system: "跟随系统", light: "浅色", dark: "深色" }[mode]}</button>)}</div></div><div className="appearance-row color-row"><span><strong>主要文字颜色</strong><small>{draft.fontColor || "使用主题默认颜色"}</small></span><div><input type="color" value={draft.fontColor || "#282b27"} onChange={(event) => update("fontColor", event.target.value)} /><button onClick={() => update("fontColor", "")}>恢复</button></div></div><div className="appearance-row color-row"><span><strong>辅助文字颜色</strong><small>{draft.mutedColor || "日期说明、天气和备注"}</small></span><div><input type="color" value={draft.mutedColor || "#82877f"} onChange={(event) => update("mutedColor", event.target.value)} /><button onClick={() => update("mutedColor", "")}>恢复</button></div></div><div className="appearance-row color-row"><span><strong>强调色</strong><small>{draft.accentColor || "使用主题默认颜色"}</small></span><div><input type="color" value={draft.accentColor.startsWith("#") ? draft.accentColor : "#506c5e"} onChange={(event) => update("accentColor", event.target.value)} /><button onClick={() => update("accentColor", "")}>恢复</button></div></div></div></section>
        <section className="settings-section"><div className="settings-section-title"><span>页面背景</span><small>图片会压缩并仅保存在本机</small></div><div className="background-card"><div className={`background-preview ${draft.backgroundImage ? "has-image" : ""}`} style={draft.backgroundImage ? { backgroundImage: `url("${draft.backgroundImage}")` } : undefined}><span>{draft.backgroundImage ? "背景预览" : "保持留白，也很好"}</span></div><div className="background-actions"><label className="upload-button">选择图片<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => void chooseBackground(event)} /></label><button className="adapt-button" disabled={!draft.backgroundImage || adapting} onClick={() => void adaptToBackground()}>{adapting ? "正在分析…" : "一键适配配色"}</button><button disabled={!draft.backgroundImage} onClick={() => update("backgroundImage", "")}>移除图片</button></div>{imageError && <p className="setting-error">{imageError}</p>}<label className="mask-control"><span>背景遮罩<strong>{Math.round(draft.backgroundMask * 100)}%</strong></span><input type="range" min="0" max="1" step="0.01" value={draft.backgroundMask} onChange={(event) => update("backgroundMask", Number(event.target.value))} /></label><label className="mask-control"><span>背景可见度<strong>{Math.round(draft.backgroundVisibility * 100)}%</strong></span><input type="range" min="0" max="1" step="0.01" value={draft.backgroundVisibility} onChange={(event) => update("backgroundVisibility", Number(event.target.value))} /></label></div></section>
        <section className="settings-section"><div className="settings-section-title"><span>数据与恢复</span><small>自动备份每天一次，并在导入前额外保存</small></div><div className="settings-card data-card"><div className="data-copy"><strong>本地备份</strong><small>包含待办、分类状态、外观设置与背景图；桌面版自动保留最近 10 份。</small></div><div className="data-actions"><button disabled={dataBusy} onClick={() => void exportBackup()}>导出备份</button><label className={dataBusy ? "disabled" : ""}>选择备份<input disabled={dataBusy} type="file" accept="application/json,.json" onChange={(event) => void chooseBackup(event)} /></label></div>{pendingBackup && <div className="restore-confirm"><span><strong>{pendingBackup.todos.length} 项待办</strong><small>备份时间 {new Date(pendingBackup.exportedAt).toLocaleString("zh-CN")}</small></span><div><button disabled={dataBusy} onClick={() => void restoreBackup("merge")}>合并导入</button><button className="danger-soft" disabled={dataBusy} onClick={() => void restoreBackup("replace")}>覆盖恢复</button></div><p>覆盖恢复会替换当前待办和设置，但操作前会先自动备份。</p></div>}{dataStatus && <p className="data-status">{dataStatus}</p>}</div></section>
        <section className="settings-section about-section"><div className="settings-section-title"><span>关于铃RIN</span><small>当前版本 0.5.0</small></div><div className="settings-card about-card"><span className="brand-mark"><img src="/rin-icon.png" alt="" /></span><div><strong>铃RIN Calendar</strong><small>数据默认保存在本机。后续版本将加入安全的应用内更新检查。</small></div></div></section>
      </div>
      <footer className="settings-footer"><button className="reset-settings" onClick={() => setDraft(defaultSettings)}>恢复全部默认</button><span /><button className="secondary" onClick={onClose}>取消</button><button className="primary" onClick={() => onSave(draft)}>保存设置</button></footer>
    </section>
  </div>;
}
