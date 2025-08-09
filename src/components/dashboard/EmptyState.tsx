import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Dictionary } from "@/contexts/dictionary-context";
import { type SupportedLang } from "@/lib/dictionaries";
import Link from "next/link";

const EmptyState = ({
  dict,
  lang,
}: {
  dict: Dictionary;
  lang: SupportedLang;
}) => {
  const t = dict.dashboard_home;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t.empty_title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{t.empty_description}</p>

          <ul className="mt-4 space-y-2">
            <li>• {t.empty_step_create_bot}</li>
            <li>• {t.empty_step_upload_docs}</li>
            <li>• {t.empty_step_connect_channel}</li>
          </ul>
        </CardContent>

        <CardFooter className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="w-full sm:w-auto">
            <Link href={`/${lang}/dashboard/setup`}>{t.cta_create_bot}</Link>
          </Button>

          <Button variant="outline" asChild className="w-full sm:w-auto">
            <Link href={`/${lang}/dashboard/knowledge-base`}>
              {t.cta_upload_docs}
            </Link>
          </Button>

          <Button variant="ghost" asChild className="w-full sm:w-auto">
            <Link href={`/${lang}/docs/getting-started`}>{t.cta_docs}</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default EmptyState;
