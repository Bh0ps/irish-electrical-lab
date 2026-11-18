import { useState } from 'react';
import { Bookmark, ChevronRight, Search, X } from 'lucide-react';
import { CHAPTERS, courseMatchesQuery, courseTitle } from '../../lib/coursebook';
import { LESSONS } from '../../lib/lessons';
import { LessonIcon } from './MenuIcons';

export function BookHome({ resume, start, index }: { resume?: string; start: () => void; index: () => void }) {
  return <section className="book-home" aria-label="Coursebook">
    <p className="book-eyebrow">{resume ? 'Your saved lesson' : 'First lesson'}</p>
    <h2>{resume ?? 'One switch, one light'}</h2>
    <p>{resume ? 'Continue from the step you reached.' : 'Try the wall switch and watch the lamp.'}</p>
    <button className="book-primary" onClick={start}>{resume ? 'Continue learning' : 'Start learning'} <ChevronRight size={17}/></button>
    <button className="book-link" onClick={index}>Browse chapters and practicals</button>
  </section>;
}

export function BookIndex({ open, practice, quick, currentLessonId, resumeCurrent }: {
  open: (lessonId: number, practical: boolean) => void; practice: () => void; quick: string;
  currentLessonId?: number; resumeCurrent?: () => void;
}) {
  const [search, setSearch] = useState('');
  const searching = Boolean(search.trim());
  const matches = LESSONS.filter(lesson => courseMatchesQuery(lesson, search));
  return <div className="book-index">
    <label className="book-search"><Search size={17} aria-hidden="true"/><input aria-label="Search configurations" type="search" value={search}
      placeholder="Search by name or what it does" onChange={event => setSearch(event.target.value)}/></label>
    <p className="sr-only" role="status">{searching ? `${matches.length} matching ${matches.length === 1 ? 'lesson' : 'lessons'}` : ''}</p>
    {CHAPTERS.map(chapter => {
      const lessons = chapter.lessons.map(id => matches.find(lesson => lesson.id === id)).filter(lesson => !!lesson);
      if (!lessons.length) return null;
      const practical = lessons.find(lesson => lesson.id === chapter.practical);
      return <details key={chapter.id + (searching ? '-searched' : '')} open={searching ? true : undefined}>
        <summary>{chapter.title} <small>{lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'}</small></summary>
        <div className="chapter-rows">{lessons.map(lesson => <button key={lesson.id} data-course-id={lesson.id}
          onClick={() => currentLessonId === lesson.id && resumeCurrent ? resumeCurrent() : open(lesson.id, false)}>
          <LessonIcon lesson={lesson}/><span>{courseTitle(lesson)}{currentLessonId === lesson.id && <small className="book-saved-place"><Bookmark size={12} aria-hidden="true"/>Saved place</small>}</span><ChevronRight size={16} aria-hidden="true"/></button>)}
          {practical && <button className="chapter-practical" onClick={() => open(chapter.practical, true)}>
            <span>Try the chapter practical<small>{courseTitle(practical)} · wire the complete circuit</small></span><ChevronRight size={16} aria-hidden="true"/></button>}
        </div></details>;
    })}
    {!matches.length && <div className="book-empty"><p>No matching lessons. Try “light”, “switch” or “motor”.</p>
      <button className="book-link" onClick={event => { setSearch(''); event.currentTarget.closest('.book-index')?.querySelector('input')?.focus(); }}><X size={14} aria-hidden="true"/>Clear search</button></div>}
    {!searching && <button className="book-link" onClick={practice}>Quick practice · {quick}</button>}
  </div>;
}
