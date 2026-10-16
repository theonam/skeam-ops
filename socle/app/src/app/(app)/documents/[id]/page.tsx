// Nouveau dans le socle.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocumentEditor, type EditorLine } from "@/components/documents/document-editor";
import { NoAccess } from "@/components/ui/no-access";
import { can } from "@/domain/access";
import { formatCentsPlain } from "@/domain/money";
import { listAttachments } from "@/server/attachments/service";
import { requireUser } from "@/server/auth/session";
import { getDocument } from "@/server/documents/service";
import { listArticles, listClients } from "@/server/referentials/service";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Document" };

const quantityText = (milli: number | null) => (milli === null ? "1" : String(milli / 1000).replace(".", ","));

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can(user.profile, "documents.read")) return <NoAccess />;
  const { id } = await params;
  const doc = await getDocument(user, id);
  if (!doc) notFound();
  const showPrices = can(user.profile, "prices.read");
  const canWrite = can(user.profile, "documents.write") && showPrices;
  const editable = canWrite && doc.status === "draft";
  const [attachments, settings, clients, articles] = await Promise.all([
    listAttachments(user, { type: "document", id }),
    showPrices ? getSettings() : Promise.resolve(null),
    editable ? listClients(user) : Promise.resolve([]),
    editable ? listArticles(user) : Promise.resolve([]),
  ]);
  const lines: EditorLine[] = doc.lines.map((l) => ({
    key: l.id,
    type: l.type,
    articleId: l.articleId,
    code: l.code,
    label: l.label,
    unit: l.unit,
    quantityText: quantityText(l.quantityMilli),
    priceText: l.unitPriceCents == null ? "" : formatCentsPlain(l.unitPriceCents).replace(/\s/g, ""),
    vatRateBp: l.vatRateBp ?? 2000,
  }));
  return (
    <DocumentEditor
      document={{
        id: doc.id,
        type: doc.type,
        status: doc.status,
        number: doc.number,
        clientId: doc.clientId,
        clientName: doc.clientName,
        subject: doc.subject,
        documentDate: doc.documentDate,
        dueDate: doc.dueDate,
        buyerName: doc.buyerName,
        buyerAddress: doc.buyerAddress,
        cancelReason: doc.cancelReason,
      }}
      lines={lines}
      showPrices={showPrices}
      canWrite={canWrite}
      canIssue={can(user.profile, "documents.issue")}
      canAddFiles={can(user.profile, "attachments.add")}
      canEditFiles={can(user.profile, "attachments.write")}
      company={settings?.company ?? null}
      clients={clients.map((c) => ({
        id: c.id,
        label: `${c.name} (${c.code})`,
        name: c.name,
        address: [c.line1, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join("\n"),
      }))}
      articles={articles.map((a) => ({ id: a.id, code: a.code, label: a.label, unit: a.unit, unitPriceCents: a.unitPriceCents ?? 0, vatRateBp: a.vatRateBp }))}
      attachments={attachments}
    />
  );
}
