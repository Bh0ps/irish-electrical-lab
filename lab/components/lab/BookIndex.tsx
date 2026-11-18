import { useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { CHAPTERS, courseMatchesQuery, courseTitle } from '../../lib/coursebook';
import { LESSONS } from '../../lib/lessons';
import { LessonIcon } from './MenuIcons';

export function BookHome({ resume, start, index }: { resume?: string; start: () => void; index: () => void }) {
  return <section className="book-home" aria-label="Coursebook">
    <p className="book-eyebrow">Electrical coursebook</p>
    <h2>{resume ?? 'One switch, one light'}</h2>
    <p>{resume ? 'Your circuit and your place are saved.' : 'Start with a wall switch and a lamp. Everything you need is already on the bench.'}</p>
    <button className="book-primary" onClick={start}>{resume ? 'Continue learning' : 'Start learning'} <ChevronRight size={17}/></button>
    <button className="book-link" onClick={index}>Browse chapters and practicals</button>
  </section>;
}

export function BookIndex({ open, practice, quick }: {
  open: (lessonId: number, practical: boolean) => void; practice: () => void; quick: string;
}) {
  const [search, setSearch] = useState('');
  const matches = LESSONS.filter(lesson => courseMatchesQuery(lesson, search));
  return <div className="book-index">
    <label className="book-search"><Search size={17}/><input aria-label="Search configurations" type="search" value={search}
      placeholder="Search by name or what it does" onChange={event => setSearch(event.target.value)}/></label>
    {CHAPTERS.map(chapter => {
      const lessons = chapter.lessons.map(id => matches.find(lesson => lesson.id === id)).filter(lesson => !!lesson);
      if (!lessons.length) return null;
      return <details key={chapter.id + (search.trim() ? '-searched' : '')} open={search.trim() ? true : undefined}>
        <summary>{chapter.title} <small>{lessons.length} lessons</small></summary>
        <div className="chapter-rows">{lessons.map(lesson => <button key={lesson.id} data-course-id={lesson.id} onClick={() => open(lesson.id, false)}>
          <LessonIcon lesson={lesson}/><span>{courseTitle(lesson)}</span><ChevronRight size={16}/></button>)}
          <button className="chapter-practical" onClick={() => open(chapter.practical, true)}>Try the chapter practical <ChevronRight size={16}/></button>
        </div></details>;
    })}
    {!matches.length && <p>No lessons found. Try “light”, “switch” or “motor”.</p>}
    <button className="book-link" onClick={practice}>Quick practice · {quick}</button>
  </div>;
}
