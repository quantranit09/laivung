import { useMemo } from "react"
import {
  autoDailyNew,
  buildLessonSession,
  buildReviewSession,
  lessonTitle,
  newLearnedToday,
  nextLesson,
  todayPlan,
  type Lesson,
} from "@/lib/srs"
import { useStore } from "@/store"

/** Kế hoạch hôm nay và các phiên có thể bắt đầu — dùng chung cho trang Học, Tổng quan, tóm tắt phiên. */
export function useStudyPlan() {
  const progress = useStore((s) => s.progress)
  const settings = useStore((s) => s.settings)
  const startStudy = useStore((s) => s.startStudy)
  const plan = useMemo(() => {
    const dailyNew = autoDailyNew(progress, settings.examDate, settings.dailyNew)
    const doneNew = newLearnedToday(progress)
    const { due } = todayPlan(progress, "all", 0)
    return { due, dailyNew, doneNew, review: buildReviewSession(due, settings.sessionSize), next: nextLesson(progress) }
  }, [progress, settings])
  const startReview = () => startStudy("study", plan.review, { label: "Ôn tập hỗn hợp" })
  const startLesson = (l: Lesson) => {
    const queue = buildLessonSession(progress, l)
    // Bài đã học hết và chưa tới hạn: cho ôn lại cả bài (FSRS vẫn tính được lần ôn sớm).
    startStudy("study", queue.length ? queue : l.ns, { label: lessonTitle(l), lesson: l.id })
  }
  return { ...plan, startReview, startLesson }
}
