"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

export type FaqRow = {
  id: string;
  question: string;
  answer: string;
  created_at: string;
};

type DialogState =
  | { mode: 'closed' }
  | { mode: 'add' }
  | { mode: 'edit'; faq: FaqRow };

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`
    );
  }
  return data;
}

export function FaqTable({ initialFaqs }: { initialFaqs: FaqRow[] }) {
  const router = useRouter();
  const [faqs, setFaqs] = useState<FaqRow[]>(initialFaqs);
  const [dialog, setDialog] = useState<DialogState>({ mode: 'closed' });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [pending, setPending] = useState(false);

  function openAdd() {
    setQuestion('');
    setAnswer('');
    setDialog({ mode: 'add' });
  }

  function openEdit(faq: FaqRow) {
    setQuestion(faq.question);
    setAnswer(faq.answer);
    setDialog({ mode: 'edit', faq });
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      if (dialog.mode === 'add') {
        const data = (await api('/api/faqs', {
          method: 'POST',
          body: JSON.stringify({ question, answer }),
        })) as { faq: FaqRow };
        setFaqs((prev) => [data.faq, ...prev]);
        toast.success('FAQ added.');
      } else if (dialog.mode === 'edit') {
        const data = (await api(`/api/faqs/${dialog.faq.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ question, answer }),
        })) as { faq: FaqRow };
        setFaqs((prev) => prev.map((f) => (f.id === data.faq.id ? data.faq : f)));
        toast.success('FAQ updated.');
      }
      setDialog({ mode: 'closed' });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setPending(false);
    }
  }

  async function onDelete() {
    if (!deleteId || pending) return;
    setPending(true);
    try {
      await api(`/api/faqs/${deleteId}`, { method: 'DELETE' });
      setFaqs((prev) => prev.filter((f) => f.id !== deleteId));
      toast.success('FAQ deleted.');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setPending(false);
      setDeleteId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          onClick={openAdd}
          className="bg-indigo-500 text-white hover:bg-indigo-400"
        >
          Add FAQ
        </Button>
      </div>

      {faqs.length === 0 ? (
        <p className="rounded-xl border border-zinc-800 px-4 py-8 text-center text-sm text-zinc-400">
          No FAQs yet. Add one to get started.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800">
                <TableHead className="text-zinc-400">Question</TableHead>
                <TableHead className="text-zinc-400">Answer</TableHead>
                <TableHead className="text-right text-zinc-400">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending &&
                [0, 1].map((i) => (
                  <TableRow key={`skel-${i}`} className="border-zinc-800">
                    <TableCell>
                      <Skeleton className="h-4 w-3/4 bg-zinc-800" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full bg-zinc-800" />
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))}
              {faqs.map((f) => (
                <TableRow key={f.id} className="border-zinc-800">
                  <TableCell className="max-w-60 truncate text-zinc-100">
                    {f.question}
                  </TableCell>
                  <TableCell className="max-w-96 truncate text-zinc-400">
                    {f.answer}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(f)}
                        className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-white"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteId(f.id)}
                        className="border-zinc-700 bg-transparent text-red-400 hover:bg-zinc-800 hover:text-red-300"
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={dialog.mode !== 'closed'}
        onOpenChange={(v) => {
          if (!v) setDialog({ mode: 'closed' });
        }}
      >
        <DialogContent className="border-zinc-800 bg-zinc-900 text-zinc-100">
          <DialogHeader>
            <DialogTitle className="text-white">
              {dialog.mode === 'edit' ? 'Edit FAQ' : 'Add FAQ'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSave} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="faq-question" className="text-zinc-300">
                Question
              </Label>
              <Input
                id="faq-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={pending}
                className="border-zinc-700 bg-zinc-950 text-zinc-100"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="faq-answer" className="text-zinc-300">
                Answer
              </Label>
              <Textarea
                id="faq-answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={4}
                disabled={pending}
                className="border-zinc-700 bg-zinc-950 text-zinc-100"
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={pending}
                className="bg-indigo-500 text-white hover:bg-indigo-400"
              >
                {pending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteId(null);
        }}
      >
        <AlertDialogContent className="border-zinc-800 bg-zinc-900 text-zinc-100">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete FAQ?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This removes the FAQ and its embedding. The widget will no longer
              answer from it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-white">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
