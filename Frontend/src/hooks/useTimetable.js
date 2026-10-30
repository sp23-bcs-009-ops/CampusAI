import { useState, useEffect } from 'react';
import { fsGet, fsList } from '../firebase/firestore';
import { parseTimetableDoc } from '../utils/helpers';

export const TIMETABLE_COLLECTION = 'text_pdf_timetables';

const emptyExam = {
  lectureSlots: {},
  timetables: {},
  displayRows: [],
  subjectsList: [],
  meta: null,
  rawDocuments: [],
  manifest: null,
};

/** Loads the selected timetable dataset and its matching manifest. */
export default function useTimetable() {
  const [state, setState] = useState({
    lectureSlots: {},
    lectureSlotsByDepartmentSemester: {},
    timetables: {},
    displayRows: [],
    displayRowsBySemester: {},
    subjectsList: [],
    subjectsBySemester: {},
    rawDocuments: [],
    currentManifest: null,
    exam: { ...emptyExam },
    meta: null,
    loading: true,
    error: null,
  });

  async function load() {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const [allDocs, currentManifest, examManifest] = await Promise.all([
        fsList(TIMETABLE_COLLECTION, { throwOnError: true }),
        fsGet(`${TIMETABLE_COLLECTION}/current`),
        fsGet(`${TIMETABLE_COLLECTION}/exam_current`),
      ]);
      const activeIds = new Set(Array.isArray(currentManifest?.documentIds) ? currentManifest.documentIds : []);
      const examIds = new Set(Array.isArray(examManifest?.documentIds) ? examManifest.documentIds : []);
      const docs = allDocs.filter(doc => activeIds.has(doc._docId));
      const examDocs = allDocs.filter(doc => examIds.has(doc._docId));

      const bySem = {};
      const displayRowsBySemester = {};
      const subjectsBySemester = {};
      const lectureSlotsByDepartmentSemester = {};
      const slotCandidates = {};
      let latestMeta = null;

      for (const doc of docs) {
        const parsed = parseTimetableDoc(doc);
        if (!parsed) continue;
        const sem = Number(doc.semester);
        if (!Number.isInteger(sem) || sem < 1) continue;
        const deptFromId = String(doc._docId || '').match(/^([a-z0-9_]+)_sem\d+$/i)?.[1];
        const dept = String(doc.dept || deptFromId || 'cs').toLowerCase();
        const key = `${dept}_sem${sem}`;

        if (!bySem[sem]) bySem[sem] = {};
        for (const [room, roomSlots] of Object.entries(parsed.timetables || {})) {
          if (!bySem[sem][room]) bySem[sem][room] = [];
          bySem[sem][room].push(...(Array.isArray(roomSlots) ? roomSlots : []).map(slot => ({
            ...slot,
            _sourceDocId: doc._docId,
            _sourceRoom: room,
            _dept: dept,
          })));
        }

        if (!displayRowsBySemester[sem]) displayRowsBySemester[sem] = [];
        displayRowsBySemester[sem].push(...(parsed.displayRows || []));
        if (!subjectsBySemester[sem]) subjectsBySemester[sem] = [];
        subjectsBySemester[sem].push(...(parsed.subjectsList || []));
        lectureSlotsByDepartmentSemester[key] = parsed.lectureSlots || {};

        for (const [number, slot] of Object.entries(parsed.lectureSlots || {})) {
          const signature = `${slot?.start || ''}-${slot?.end || ''}`;
          (slotCandidates[number] ||= new Set()).add(signature);
        }

        const updatedAt = doc.updatedAt || '';
        if (!latestMeta || updatedAt > (latestMeta.updatedAt || '')) {
          latestMeta = {
            version: parsed.version,
            effectiveDate: parsed.effectiveDate,
            uploadedBy: parsed.uploadedBy,
            pdfUrl: parsed.pdfUrl,
            status: parsed.status,
            updatedAt,
          };
        }
      }

      for (const sem of Object.keys(displayRowsBySemester)) {
        displayRowsBySemester[sem].sort((a, b) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(a.day)
          - ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(b.day));
      }
      for (const sem of Object.keys(subjectsBySemester)) {
        const seen = new Set();
        subjectsBySemester[sem] = subjectsBySemester[sem].filter(subject => {
          const key = `${subject?.dept || ''}|${subject?.subject || ''}|${subject?.prof || ''}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      // The map consumes a global slot table; include only unambiguous PDF-derived slots.
      let lectureSlots = {};
      for (const [number, candidates] of Object.entries(slotCandidates)) {
        if (candidates.size !== 1) continue;
        const [range] = candidates;
        const [start, end] = range.split('-');
        if (start && end) lectureSlots[number] = { label: `Lecture ${number}`, start, end };
      }

      const defaultSem = Object.keys(bySem)[0];

      // Exam dataset: merged across every active exam document and kept fully
      // separate from the regular one so mode switches never reload Firebase.
      const examTimetables = {};
      const examSlotCandidates = {};
      const examDisplayRows = [];
      const examSubjectsList = [];
      let examMeta = null;

      for (const doc of examDocs) {
        const parsed = parseTimetableDoc(doc);
        if (!parsed) continue;
        const sem = Number(doc.semester);
        const deptFromId = String(doc._docId || '').match(/^exam_([a-z0-9_]+)_sem\d+$/i)?.[1];
        const dept = String(doc.dept || deptFromId || '').toLowerCase();

        for (const [room, roomSlots] of Object.entries(parsed.timetables || {})) {
          if (!examTimetables[room]) examTimetables[room] = [];
          examTimetables[room].push(...(Array.isArray(roomSlots) ? roomSlots : []).map(slot => ({
            ...slot,
            _sourceDocId: doc._docId,
            _sourceRoom: room,
            _dept: dept,
            sem: Number.isInteger(sem) && sem > 0 ? sem : slot?.sem,
          })));
        }
        examDisplayRows.push(...(parsed.displayRows || []));
        examSubjectsList.push(...(parsed.subjectsList || []));

        for (const [number, slot] of Object.entries(parsed.lectureSlots || {})) {
          const signature = `${slot?.start || ''}-${slot?.end || ''}`;
          (examSlotCandidates[number] ||= new Set()).add(signature);
        }

        const updatedAt = doc.updatedAt || '';
        if (!examMeta || updatedAt > (examMeta.updatedAt || '')) {
          examMeta = {
            version: parsed.version,
            effectiveDate: parsed.effectiveDate,
            uploadedBy: parsed.uploadedBy,
            pdfUrl: parsed.pdfUrl,
            status: parsed.status,
            updatedAt,
          };
        }
      }

      const examLectureSlots = {};
      for (const [number, candidates] of Object.entries(examSlotCandidates)) {
        if (candidates.size !== 1) continue;
        const [range] = candidates;
        const [start, end] = range.split('-');
        if (start && end) examLectureSlots[number] = { label: `Lecture ${number}`, start, end };
      }

      const exam = examDocs.length ? {
        lectureSlots: examLectureSlots,
        timetables: examTimetables,
        displayRows: examDisplayRows,
        subjectsList: examSubjectsList,
        meta: examMeta,
        rawDocuments: examDocs,
        manifest: examManifest,
      } : { ...emptyExam };

      setState({
        lectureSlots,
        lectureSlotsByDepartmentSemester,
        timetables: bySem,
        displayRows: displayRowsBySemester[defaultSem] || [],
        displayRowsBySemester,
        subjectsList: subjectsBySemester[defaultSem] || [],
        subjectsBySemester,
        rawDocuments: docs,
        currentManifest,
        exam,
        meta: latestMeta,
        loading: false,
        error: null,
      });
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: 'Could not load timetable.' }));
    }
  }

  useEffect(() => { load(); }, []);

  return { ...state, reload: load };
}
