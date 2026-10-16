// Nouveau dans le socle.
import type { Metadata } from "next";
import { SettingsForm } from "@/components/data/settings-form";
import { NoAccess } from "@/components/ui/no-access";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/domain/access";
import { requireUser } from "@/server/auth/session";
import { getSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Paramètres" };

export default async function Page() {
  const user = await requireUser();
  if (!can(user.profile, "settings.write")) return <NoAccess />;
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Paramètres de l'entreprise" />
      <div className="max-w-4xl px-4 pb-8 tablet:px-6">
        <SettingsForm
          initial={{
            ...s.company,
            quoteValidityDays: s.quoteValidityDays,
            paymentTermsDays: s.paymentTermsDays,
            quoteEmailSubject: s.quoteEmailSubject,
            quoteEmailBody: s.quoteEmailBody,
            invoiceEmailSubject: s.invoiceEmailSubject,
            invoiceEmailBody: s.invoiceEmailBody,
            pdfFilenamePattern: s.pdfFilenamePattern,
          }}
        />
      </div>
    </>
  );
}
