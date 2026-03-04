import { useState, useCallback } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CloudUpload,
  FileText,
  X,
  Loader2,
  Sparkles,
  CalendarIcon,
  Clock,
  Filter,
  Download,
  Zap,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

// --- Types ---
type HRAction = "None" | "Shortlist" | "Mark as Potential" | "Hold" | "Reject";

interface Candidate {
  id: string;
  job_id: string;
  name: string;
  email: string;
  match_score: number;
  experience: string;
  status: string;
  potential_fit: boolean;
  summary: string;
  strengths: string[];
  skill_match: string[];
  gaps: string[];
  reason_low_score: string;
  reason_potential: string;
  hr_action: string;
  previously_shortlisted: boolean;
  interview_status: string;
  resume_url: string;
}

const N8N_SCREENING_URL = "https://shortlistr.app.n8n.cloud/webhook/Run Screening";
const N8N_INVITE_URL = "https://shortlistr.app.n8n.cloud/webhook/invite-candidate";

// Simple avatar with initials
function CandidateAvatar({ name }: { name: string }) {
  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
      {initials}
    </div>
  );
}

// Progress bar for match score
function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-foreground transition-all"
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-sm font-medium text-foreground">{score}%</span>
    </div>
  );
}

export default function Dashboard() {
  const { toast } = useToast();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // File upload
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Screening
  const [isScreening, setIsScreening] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Detail panel
  const [detailCandidate, setDetailCandidate] = useState<Candidate | null>(null);

  // Interview modal
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [interviewDate, setInterviewDate] = useState<Date | undefined>();
  const [interviewTime, setInterviewTime] = useState("");
  const [isSendingInvite, setIsSendingInvite] = useState(false);

  const isFormValid = title.trim() !== "" && description.trim() !== "";

  const getEffectiveStatus = (c: Candidate): string => {
    if (c.hr_action === "Shortlist") return "Shortlisted";
    if (c.hr_action === "Reject") return "Rejected";
    if (c.hr_action === "Mark as Potential") return "Potential";
    if (c.hr_action === "Hold") return "Hold";
    // Map raw status to three-tier system
    const s = c.status?.toLowerCase() || "";
    if (s.includes("shortlist")) return "Shortlisted";
    if (s.includes("potential") || c.potential_fit) return "Potential";
    return "Rejected";
  };

  const hasShortlistedSelected = Array.from(selected).some((id) => {
    const c = candidates.find((c) => c.id === id);
    return c && getEffectiveStatus(c) === "Shortlisted";
  });

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const pdfs = Array.from(newFiles).filter((f) => f.type === "application/pdf");
    setFiles((prev) => [...prev, ...pdfs]);
  };

  const removeFile = (index: number) => setFiles(files.filter((_, i) => i !== index));

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }, []);

  const runScreening = async () => {
    setIsScreening(true);
    try {
      setCandidates([]);

      const formData = new FormData();
      formData.append("job_title", title);
      formData.append("job_description", description);
      files.forEach((f) => formData.append("resumes", f));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120_000);

      const res = await fetch(N8N_SCREENING_URL, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`Screening failed: ${res.status}`);

      const result = await res.json();

      // Parse candidates from webhook response
      let parsed: Candidate[] = [];
      const rawCandidates = Array.isArray(result) ? result : result?.candidates || result?.data || [];
      parsed = rawCandidates.map((r: any, i: number) => ({
        id: r.id || `candidate-${i}-${Date.now()}`,
        job_id: "",
        name: r.candidate_name || r.name || "Unknown",
        email: r.candidate_email || r.email || "",
        match_score: Math.min(100, Math.max(0, Number(r.match_score) || 0)),
        experience: r.experience || "",
        status: r.status || "Rejected",
        potential_fit: r.potential_fit === true || r.potential_fit === "true" || r.potential_fit === "TRUE",
        summary: r.summary || "",
        strengths: Array.isArray(r.strengths) ? r.strengths : typeof r.strengths === "string" ? r.strengths.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
        skill_match: Array.isArray(r.skill_match) ? r.skill_match : typeof r.skill_match === "string" ? r.skill_match.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
        gaps: Array.isArray(r.gaps) ? r.gaps : typeof r.gaps === "string" ? r.gaps.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
        reason_low_score: r.reason_low_score || "",
        reason_potential: r.reason_potential || "",
        hr_action: r.hr_action || "None",
        previously_shortlisted: r.previously_shortlisted === true,
        interview_status: r.interview_status || "Not Scheduled",
        resume_url: r.resume_url || "",
      }));

      setCandidates(parsed);
      toast({ title: "Screening Complete", description: `${parsed.length} candidates analyzed.` });
    } catch (err: any) {
      console.error("Screening error:", err);
      toast({ title: "Screening Failed", description: err.message, variant: "destructive" });
    } finally {
      setIsScreening(false);
    }
  };

  const updateHRAction = async (candidateId: string, action: HRAction) => {
    const candidate = candidates.find((c) => c.id === candidateId);
    if (!candidate) return;
    const updates: any = { hr_action: action };
    if (candidate.hr_action === "Shortlist" && action === "Reject") {
      updates.previously_shortlisted = true;
    }
    setCandidates((prev) => prev.map((c) => (c.id === candidateId ? { ...c, ...updates } : c)));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === candidates.length) setSelected(new Set());
    else setSelected(new Set(candidates.map((c) => c.id)));
  };

  const confirmInterview = async () => {
    if (!interviewDate || !interviewTime) return;
    setIsSendingInvite(true);
    const dateObj = new Date(interviewDate);
    const [hours, minutes] = interviewTime.split(":");
    dateObj.setHours(parseInt(hours), parseInt(minutes));
    const isoTime = dateObj.toISOString();

    const selectedCandidates = candidates.filter(
      (c) => selected.has(c.id) && getEffectiveStatus(c) === "Shortlisted"
    );

    try {
      for (const c of selectedCandidates) {
        const res = await fetch(N8N_INVITE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidate_email: c.email,
            candidate_name: c.name,
            job_title: title,
            interview_time: isoTime,
          }),
        });
        if (!res.ok) throw new Error(`Invite failed for ${c.name}: ${res.status}`);
        // Status updated locally only — no Supabase
      }

      setCandidates((prev) =>
        prev.map((c) =>
          selected.has(c.id) && getEffectiveStatus(c) === "Shortlisted"
            ? { ...c, interview_status: "Scheduled" }
            : c
        )
      );
      toast({ title: "Invite Sent!", description: "Interview successfully scheduled and calendar invite sent!" });
      setSelected(new Set());
      setScheduleOpen(false);
      setInterviewDate(undefined);
      setInterviewTime("");
    } catch (err: any) {
      toast({ title: "Failed to send invite", description: err.message, variant: "destructive" });
    } finally {
      setIsSendingInvite(false);
    }
  };

  const getStatusBadge = (c: Candidate) => {
    const status = getEffectiveStatus(c);
    switch (status) {
      case "Shortlisted":
        return <Badge className="bg-success text-success-foreground text-xs">{status}</Badge>;
      case "Potential":
        return <Badge className="bg-potential/10 text-potential border border-potential/20 text-xs">{status}</Badge>;
      case "Rejected":
        return <Badge className="bg-destructive/10 text-destructive border border-destructive/20 text-xs">{status}</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">{status}</Badge>;
    }
  };

  return (
    <AppLayout>
      {/* Full-screen loading overlay */}
      {isScreening && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
          <Loader2 className="h-12 w-12 animate-spin text-accent mb-4" />
          <p className="text-lg font-semibold">Analyzing resumes… this may take a minute.</p>
          <p className="text-sm text-muted-foreground mt-1">Processing {files.length} resume{files.length !== 1 ? "s" : ""} sequentially — please don't close this page.</p>
        </div>
      )}

      <div className="animate-fade-in space-y-6 max-w-7xl">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Shortlistr</span>
          <ChevronRight className="h-3.5 w-3.5" />
          <span>Talent Acquisition</span>
        </div>

        {/* Job Title + Description side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1.5">
            <Label htmlFor="title" className="text-sm font-medium text-foreground">Job Title</Label>
            <Input
              id="title"
              placeholder="e.g. Senior Product Manager"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-card"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description" className="text-sm font-medium text-foreground">Job Description</Label>
            <Input
              id="description"
              placeholder="Paste or type the job description here..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-card"
            />
          </div>
        </div>

        {/* Upload Resumes */}
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-foreground">Upload Resumes</Label>
          <div className="flex items-end gap-4">
            <div
              className={cn(
                "flex-1 flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-8 px-6 transition-colors cursor-pointer bg-card",
                isDragging ? "border-accent bg-accent/5" : "border-border hover:border-accent/50"
              )}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById("file-input")?.click()}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                <CloudUpload className="h-6 w-6 text-accent" />
              </div>
              <p className="text-sm">
                <span className="font-semibold text-accent">Click to upload</span>
                <span className="text-muted-foreground"> or drag and drop</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">PDF files only (Max 10MB each)</p>
              <input
                id="file-input"
                type="file"
                multiple
                accept=".pdf"
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
            </div>

            <Button
              size="lg"
              className="gap-2 bg-foreground text-background hover:bg-foreground/90 shrink-0 h-12 px-6"
              disabled={!isFormValid || files.length === 0 || isScreening}
              onClick={runScreening}
            >
              <Sparkles className="h-4 w-4" />
              Run AI Screening
            </Button>
          </div>

          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {files.map((file, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm">
                  <FileText className="h-3.5 w-3.5 text-accent" />
                  <span className="truncate max-w-[150px]">{file.name}</span>
                  <button onClick={() => removeFile(i)} className="p-0.5 hover:bg-muted rounded">
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Candidates Section */}
        {candidates.length > 0 && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  className={cn(
                    "gap-2 text-sm",
                    hasShortlistedSelected
                      ? "border-success text-success hover:bg-success/10"
                      : "text-muted-foreground"
                  )}
                  disabled={!hasShortlistedSelected}
                  onClick={() => setScheduleOpen(true)}
                >
                  <CalendarIcon className="h-4 w-4" />
                  Schedule Interview
                </Button>
                {!hasShortlistedSelected && (
                  <span className="text-xs text-muted-foreground">Select a shortlisted candidate to schedule</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Filter className="h-3.5 w-3.5" />
                  Filter
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
              </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selected.size === candidates.length && candidates.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Name</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Match Score</TableHead>
                    
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">Resume</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">HR Action</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Interview</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates
                    .sort((a, b) => b.match_score - a.match_score)
                    .map((c) => {
                      const effectiveStatus = getEffectiveStatus(c);
                      return (
                        <TableRow
                          key={c.id}
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => setDetailCandidate(c)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selected.has(c.id)}
                              onCheckedChange={() => toggleSelect(c.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <CandidateAvatar name={c.name} />
                              <div>
                                <p className="text-sm font-medium text-foreground">{c.name}</p>
                                <p className="text-xs text-muted-foreground">{c.experience ? `${c.experience}` : "—"}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <ScoreBar score={c.match_score} />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {getStatusBadge(c)}
                              {c.potential_fit && (
                                <Badge className="bg-potential/10 text-potential border border-potential/20 text-[10px] px-1.5 py-0 w-fit gap-0.5">
                                  <Zap className="h-2.5 w-2.5" />
                                  Potential Fit
                                </Badge>
                              )}
                              {c.previously_shortlisted && effectiveStatus === "Rejected" && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 w-fit text-muted-foreground">
                                  Previously Shortlisted
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            {c.resume_url ? (
                              <a href={c.resume_url} target="_blank" rel="noopener noreferrer">
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <FileText className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </a>
                            ) : (
                              <FileText className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                            )}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Select
                              value={c.hr_action}
                              onValueChange={(v) => updateHRAction(c.id, v as HRAction)}
                            >
                              <SelectTrigger className="w-[130px] h-8 text-xs border-0 bg-transparent hover:bg-muted/50 gap-1">
                                <SelectValue placeholder="Move to" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="None">None</SelectItem>
                                <SelectItem value="Shortlist">Shortlist</SelectItem>
                                <SelectItem value="Mark as Potential">Mark as Potential</SelectItem>
                                <SelectItem value="Hold">Hold</SelectItem>
                                <SelectItem value="Reject">Reject</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {c.interview_status === "Scheduled" ? (
                              <Badge className="bg-success/10 text-success border border-success/20 text-xs gap-1">
                                <CalendarIcon className="h-3 w-3" />
                                Scheduled
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Not Scheduled</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* Candidate Detail Side Panel */}
      <Sheet open={!!detailCandidate} onOpenChange={(o) => !o && setDetailCandidate(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          {detailCandidate && (
            <>
              <SheetHeader>
                <SheetTitle>{detailCandidate.name}</SheetTitle>
                <p className="text-sm text-muted-foreground">{detailCandidate.email}</p>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl border text-lg font-bold bg-accent/10 text-accent">
                    {detailCandidate.match_score}
                  </div>
                  <div>
                    <p className="text-sm font-medium">Match Score</p>
                    <p className="text-xs text-muted-foreground">AI-generated score</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Summary</p>
                  <p className="text-sm">{detailCandidate.summary}</p>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Strengths</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detailCandidate.strengths.map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Skill Match</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detailCandidate.skill_match.map((s) => (
                      <Badge key={s} className="bg-accent/10 text-accent border border-accent/20 text-xs">{s}</Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Gaps</p>
                  <div className="flex flex-wrap gap-1.5">
                    {detailCandidate.gaps.map((g) => (
                      <Badge key={g} variant="outline" className="text-xs text-muted-foreground">{g}</Badge>
                    ))}
                  </div>
                </div>

                {detailCandidate.reason_low_score && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Reason for Low Score</p>
                    <p className="text-sm text-destructive">{detailCandidate.reason_low_score}</p>
                  </div>
                )}

                {detailCandidate.potential_fit && detailCandidate.reason_potential && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Reason for Potential Tag</p>
                    <p className="text-sm text-potential">{detailCandidate.reason_potential}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Interview Scheduling Modal */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Interview</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {Array.from(selected).filter((id) => {
                const c = candidates.find((c) => c.id === id);
                return c && getEffectiveStatus(c) === "Shortlisted";
              }).length} shortlisted candidate(s) selected
            </p>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !interviewDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {interviewDate ? format(interviewDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={interviewDate}
                    onSelect={setInterviewDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Time</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input type="time" className="pl-9" value={interviewTime} onChange={(e) => setInterviewTime(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={!interviewDate || !interviewTime || isSendingInvite}
              onClick={confirmInterview}
            >
              {isSendingInvite ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Appointment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
