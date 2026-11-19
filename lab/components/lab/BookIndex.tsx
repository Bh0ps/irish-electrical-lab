import {bellFaultActivity,bellFaultTitle} from '../../lib/bell-fault';
import { worktopFaultTitle } from '../../lib/fault-practice';
import { heaterFaultActivity, heaterFaultTitle } from '../../lib/heater-fault';
import { useState, useMemo } from 'react';
import { Bookmark, Check, ChevronRight, Search, X } from 'lucide-react';
import { CHAPTERS, completedCoursebookLesson, courseMatchesQuery, courseTitle, matchesStudyQuery } from '../../lib/coursebook';
import { LESSONS } from '../../lib/lessons';
import { HOUSE_CALLS, houseStepId } from '../../lib/house-calls';
import type { StudyProgress } from '../../lib/progress';
import { LessonIcon } from './MenuIcons';

export function BookHome({ resume, start, index }: { resume?: string; start: () => void; index: () => void }) {
  return <section className="book-home" aria-label="Coursebook">
    <p className="book-eyebrow">{resume ? 'Your saved lesson' : 'First lesson'}</p>
    <h2>{resume ?? 'One switch, one light'}</h2>
    <p>{resume ? 'Pick up where you left off.' : 'Try the wall switch and watch the lamp.'}</p>
    <button className="book-primary" onClick={start}>{resume ? 'Continue learning' : 'Start learning'} <ChevronRight size={17}/></button>
    <button className="book-link" onClick={index}>Browse chapters and practicals</button>
  </section>;
}

export function BookIndex({ open, practice, quick, currentLessonId, resumeCurrent, houseCall, progress, showJobs, resumeJobId, worktopFault, savedWorktopFault, heaterFault, savedHeaterFault, bellFault,savedBellFault }: {
  bellFault?:()=>void; savedBellFault?:boolean;
  worktopFault:()=>void; savedWorktopFault:boolean;
  heaterFault:()=>void; savedHeaterFault:boolean;
  open: (lessonId: number, practical: boolean) => void; practice: () => void; quick: string;
  houseCall: (lessonId:number)=>void; progress: StudyProgress; showJobs?:boolean; resumeJobId?:number;
  currentLessonId?: number; resumeCurrent?: () => void;
}) {
  const [search, setSearch] = useState('');
  const completed=useMemo(()=>new Set(LESSONS.filter(lesson=>completedCoursebookLesson(lesson,progress.learning[lesson.id]?.activityIds??[])).map(lesson=>lesson.id)),[progress.learning]);
  const searching = Boolean(search.trim());
  const matches = LESSONS.filter(lesson => courseMatchesQuery(lesson, search));
  const jobs = HOUSE_CALLS.filter(job=>matchesStudyQuery(['Jobs at Oakfield house',job.title,job.request,job.searchTerms,...job.steps.map(step=>step.instruction)].join(' '),search));
  const faultJobs=[
    {title:worktopFaultTitle,lesson:66,activity:'lesson:66:fault:worktop',terms:'kitchen right worktop strip switch meter',open:worktopFault,saved:savedWorktopFault},
    {title:heaterFaultTitle,lesson:20,activity:heaterFaultActivity,terms:'fused spur heater wall switch flex meter',open:heaterFault,saved:savedHeaterFault},
    {title:bellFaultTitle,lesson:72,activity:bellFaultActivity,terms:'hall chime doorbell back door button quiet',open:bellFault,saved:savedBellFault},
  ].filter(job=>job.open&&matchesStudyQuery('Fault finding repair at Oakfield house '+job.title+' '+job.terms,search));
  const jobCount=jobs.length+faultJobs.length;
  return <div className="book-index">
    <label className="book-search"><Search size={17} aria-hidden="true"/><input aria-label="Search lessons and jobs" type="search" value={search}
      placeholder="Search lessons and jobs" onChange={event => setSearch(event.target.value)}/></label>
    <p className="sr-only" role="status">{searching ? `${jobCount} ${jobCount===1?'job':'jobs'} and ${matches.length} ${matches.length === 1 ? 'lesson' : 'lessons'} found` : ''}</p>
    {jobCount>0 && <details key={searching?'jobs-found':'jobs'} open={searching||showJobs||undefined}>
      <summary>Jobs at Oakfield house<small>{jobCount} {jobCount===1?'job':'short jobs'}</small></summary>
      <div className="chapter-rows">{jobs.map(job=><button type="button" key={job.lesson} onClick={()=>job.lesson===resumeJobId&&resumeCurrent?resumeCurrent():houseCall(job.lesson)}>
        <span>{job.title}{resumeJobId===job.lesson&&<small className="book-saved-place"><Bookmark size={12} aria-hidden="true"/>Saved place</small>}{resumeJobId!==job.lesson&&progress.learning[job.lesson]?.activityIds.includes(houseStepId(job,job.steps.length-1))&&<small className="book-saved-place">Completed</small>}</span><ChevronRight size={16} aria-hidden="true"/>
      </button>)}{faultJobs.map(job=><button type="button" key={job.activity} onClick={job.open}><span>{job.title}<small>{job.saved?'Saved place':progress.learning[job.lesson]?.activityIds.includes(job.activity)?'Completed':'Fault practice'}</small></span><ChevronRight size={16} aria-hidden="true"/></button>)}</div>
    </details>}
    {CHAPTERS.map(chapter => {
      const lessons = chapter.lessons.map(id => matches.find(lesson => lesson.id === id)).filter(lesson => !!lesson);
      if (!lessons.length) return null;
      const practical = lessons.find(lesson => lesson.id === chapter.practical);
      const finished=chapter.lessons.filter(id=>completed.has(id)).length;
      return <details key={chapter.id + (searching ? '-searched' : '')} open={searching ? true : undefined}>
        <summary>{chapter.title} <small>{finished && !searching ? finished+' of '+chapter.lessons.length+' complete' : lessons.length+(lessons.length===1?' lesson':' lessons')}</small></summary>
        <div className="chapter-rows">{lessons.map(lesson => <button key={lesson.id} data-course-id={lesson.id}
          onClick={() => currentLessonId === lesson.id && resumeCurrent ? resumeCurrent() : open(lesson.id, false)}>
          <LessonIcon lesson={lesson}/><span>{courseTitle(lesson)}{completed.has(lesson.id)&&<small className="book-saved-place"><Check size={12} aria-hidden="true"/>Completed</small>}{currentLessonId === lesson.id && !completed.has(lesson.id) && <small className="book-saved-place"><Bookmark size={12} aria-hidden="true"/>Saved place</small>}</span><ChevronRight size={16} aria-hidden="true"/></button>)}
          {practical && <button className="chapter-practical" onClick={() => open(chapter.practical, true)}>
            <span>Try the chapter practical<small>{courseTitle(practical)} · wire the complete circuit</small></span><ChevronRight size={16} aria-hidden="true"/></button>}
        </div></details>;
    })}
    {!jobCount && !matches.length && <div className="book-empty"><p>No matches. Try “light”, “switch” or “motor”.</p>
      <button className="book-link" onClick={event => { setSearch(''); event.currentTarget.closest('.book-index')?.querySelector('input')?.focus(); }}><X size={14} aria-hidden="true"/>Clear search</button></div>}
    {!searching && <button className="book-link" onClick={practice}>Quick practice · {quick}</button>}
  </div>;
}
