// Nouveau dans le socle.
import type { Metadata } from "next";
import { ArticlesList } from "@/components/lists/articles-list";
import { NoAccess } from "@/components/ui/no-access";
import { PageHeader } from "@/components/ui/page-header";
import { can, canSeeField } from "@/domain/access";
import { requireUser } from "@/server/auth/session";
import { readListPreferences } from "@/server/preferences/list-preferences";
import { listArticles } from "@/server/referentials/service";

export const metadata: Metadata = { title: "Articles" };

export default async function Page() {
  const user = await requireUser();
  if (!can(user.profile, "articles.read")) return <NoAccess />;
  const [rows, preferences] = await Promise.all([listArticles(user), readListPreferences(user.id, "list:articles")]);
  return (
    <>
      <PageHeader title="Articles" />
      <ArticlesList rows={rows} preferences={preferences} showPrices={canSeeField(user.profile, "articles", "unitPriceCents")} />
    </>
  );
}
