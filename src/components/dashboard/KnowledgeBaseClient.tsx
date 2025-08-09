"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dictionary } from "@/contexts/dictionary-context";
import { SupportedLang } from "@/lib/dictionaries";
import { KnowledgeBase } from "@prisma/client";
import { FileText } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

type KnowledgeBaseClientProps = {
  initialKb: KnowledgeBase | null;
  lang: SupportedLang;
  dict: Dictionary;
};

const KnowledgeBaseClient = ({
  initialKb,
  lang,
  dict,
}: KnowledgeBaseClientProps) => {
  const [kb] = useState(initialKb);
  const t = dict.dashboard_knowledge_base;

  // const locale = lang === "ar" ? "ar" : "en-US";

  // const handleEdit = () => {
  //   router.push(`/${lang}/dashboard/setup`);
  // };

  // const handleDelete = () => {
  //   const ok = confirm(t.delete_kb_confirm ?? "Delete knowledge base?");
  //   if (!ok) return;
  //   toast.success(t.delete_kb_success);
  // };

  // const handleCopyJson = async () => {
  //   toast.success(t.copy_json_success ?? "Copied JSON to clipboard");
  // };

  // const handleDownloadJson = () => {
  //   try {
  //     const content = JSON.stringify(kb, null, 2);
  //     const blob = new Blob([content], {
  //       type: "application/json;charset=utf-8;",
  //     });
  //     const url = URL.createObjectURL(blob);
  //     const a = document.createElement("a");
  //     a.href = url;
  //     a.download = `aoun-kb-${new Date().toISOString().slice(0, 10)}.json`;
  //     a.click();
  //     URL.revokeObjectURL(url);
  //     toast.success(t.download_json_success ?? "Downloaded JSON");
  //   } catch (err) {
  //     console.error(err);
  //     toast.error(t.download_json_error ?? "Failed to download");
  //   }
  // };

  // No KB view
  if (!kb) {
    return (
      <div className="space-y-6">
        <h1 className="font-headline text-2xl font-bold rtl:text-right">
          {t.title}
        </h1>
        <Alert>
          <FileText className="h-4 w-4" />
          <AlertTitle>{t.no_kb_title}</AlertTitle>
          <AlertDescription>
            <div className="flex flex-col gap-3">
              <p>{t.no_kb_desc}</p>
              <div className="flex gap-2">
                <Button asChild>
                  <Link href={`/${lang}/dashboard/setup`}>
                    {t.no_kb_button}
                  </Link>
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // KB present view
  // return (
  //   <div className="space-y-6">
  //     <div className="flex items-center justify-between rtl:flex-row-reverse">
  //       <div className="rtl:text-right">
  //         <h1 className="font-headline text-2xl font-bold">{t.title}</h1>
  //         <p className="text-muted-foreground">{t.description}</p>
  //       </div>

  //       <div className="flex gap-2">
  //         <Button variant="ghost" onClick={handleCopyJson}>
  //           {t.copy_json ?? "Copy JSON"}
  //         </Button>
  //         <Button variant="outline" onClick={handleDownloadJson}>
  //           {t.download_json ?? "Download JSON"}
  //         </Button>
  //         <Button onClick={handleEdit}>
  //           <Sprout className="mr-2" /> {t.update_button}
  //         </Button>
  //         <Button variant="destructive" onClick={handleDelete}>
  //           {t.delete_kb ?? "Delete"}
  //         </Button>
  //       </div>
  //     </div>

  //     <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
  //       {/* Left column */}
  //       <div className="space-y-6">
  //         {kb.botProfile && (
  //           <Card className="rtl:text-right">
  //             <CardHeader>
  //               <CardTitle className="flex items-center gap-2 rtl:flex-row-reverse">
  //                 <Bot className="text-primary h-5 w-5" /> {t.bot_profile_title}
  //               </CardTitle>
  //             </CardHeader>
  //             <CardContent className="space-y-3">
  //               <p>
  //                 <strong>{t.bot_name}:</strong> {kb.botProfile.name}
  //               </p>
  //               <p>
  //                 <strong>{t.bot_personality}:</strong>{" "}
  //                 <span className="italic">"{kb.botProfile.personality}"</span>
  //               </p>
  //               <p>
  //                 <strong>{t.bot_voice}:</strong> {kb.botProfile.voiceName}
  //               </p>

  //               <div className="flex items-center gap-4">
  //                 <strong>{t.bot_colors}:</strong>
  //                 <div className="flex items-center gap-2">
  //                   <div
  //                     className="h-5 w-5 rounded-full border"
  //                     style={{ backgroundColor: kb.botProfile.primaryColor }}
  //                   />
  //                   <span className="font-mono text-xs">
  //                     {kb.botProfile.primaryColor}
  //                   </span>
  //                 </div>
  //                 <div className="flex items-center gap-2">
  //                   <div
  //                     className="h-5 w-5 rounded-full border"
  //                     style={{ backgroundColor: kb.botProfile.accentColor }}
  //                   />
  //                   <span className="font-mono text-xs">
  //                     {kb.botProfile.accentColor}
  //                   </span>
  //                 </div>
  //               </div>

  //               {kb.createdAt && (
  //                 <p className="text-muted-foreground text-xs">
  //                   {t.created_at_label ?? "Created At"}:{" "}
  //                   {new Date(kb.createdAt).toLocaleString(locale)}
  //                 </p>
  //               )}
  //             </CardContent>
  //           </Card>
  //         )}

  //         {kb.company && (
  //           <Card className="rtl:text-right">
  //             <CardHeader>
  //               <CardTitle className="flex items-center gap-2 rtl:flex-row-reverse">
  //                 <Briefcase className="text-primary h-5 w-5" />{" "}
  //                 {t.company_info_title}
  //               </CardTitle>
  //             </CardHeader>
  //             <CardContent className="space-y-3">
  //               <p>
  //                 <strong>{t.company_name}:</strong> {kb.company.name}
  //               </p>
  //               <p>
  //                 <strong>{t.company_description}:</strong>{" "}
  //                 {kb.company.description}
  //               </p>
  //               <p>
  //                 <strong>{t.company_location}:</strong> {kb.company.location}
  //               </p>
  //             </CardContent>
  //           </Card>
  //         )}
  //       </div>

  //       {/* Right column */}
  //       <div className="space-y-6">
  //         {kb.services?.length > 0 && (
  //           <Card className="rtl:text-right">
  //             <CardHeader>
  //               <CardTitle className="flex items-center gap-2 rtl:flex-row-reverse">
  //                 <ConciergeBell className="text-primary h-5 w-5" />{" "}
  //                 {t.services_title}
  //               </CardTitle>
  //             </CardHeader>
  //             <CardContent>
  //               <ul className="space-y-2">
  //                 {kb.services.map((s: any, idx: number) => (
  //                   <li
  //                     key={idx}
  //                     className="bg-secondary/50 rounded-md p-2 text-sm"
  //                   >
  //                     <strong>{s.name}:</strong> {s.description}
  //                   </li>
  //                 ))}
  //               </ul>
  //             </CardContent>
  //           </Card>
  //         )}

  //         {kb.pricing?.length > 0 && (
  //           <Card className="rtl:text-right">
  //             <CardHeader>
  //               <CardTitle className="flex items-center gap-2 rtl:flex-row-reverse">
  //                 <Tag className="text-primary h-5 w-5" /> {t.pricing_title}
  //               </CardTitle>
  //             </CardHeader>
  //             <CardContent>
  //               <ul className="space-y-2">
  //                 {kb.pricing.map((p: any, i: number) => (
  //                   <li
  //                     key={i}
  //                     className="bg-secondary/50 rounded-md p-2 text-sm"
  //                   >
  //                     <strong>
  //                       {p.tier} ({p.price}):
  //                     </strong>{" "}
  //                     {p.details}
  //                   </li>
  //                 ))}
  //               </ul>
  //             </CardContent>
  //           </Card>
  //         )}
  //       </div>
  //     </div>

  //     {kb.faq?.length > 0 && (
  //       <Card className="rtl:text-right">
  //         <CardHeader>
  //           <CardTitle className="flex items-center gap-2 rtl:flex-row-reverse">
  //             <HelpCircle className="text-primary h-5 w-5" /> {t.faq_title}
  //           </CardTitle>
  //         </CardHeader>
  //         <CardContent>
  //           <ul className="columns-1 space-y-2 md:columns-2">
  //             {kb.faq.map((item: any, idx: number) => (
  //               <li
  //                 key={idx}
  //                 className="bg-secondary/50 break-inside-avoid rounded-md p-2 text-sm"
  //               >
  //                 <strong>Q: {item.question}</strong>
  //                 <br />
  //                 A: {item.answer}
  //               </li>
  //             ))}
  //           </ul>
  //         </CardContent>
  //       </Card>
  //     )}

  //     <Card className="rtl:text-right">
  //       <CardHeader>
  //         <CardTitle className="flex items-center gap-2 rtl:flex-row-reverse">
  //           <Terminal className="text-primary h-5 w-5" /> {t.raw_json_title}
  //         </CardTitle>
  //         <CardDescription>{t.raw_json_desc}</CardDescription>
  //       </CardHeader>

  //       <CardContent>
  //         <div className="bg-muted mt-2 rounded-lg p-4">
  //           <pre className="font-code overflow-x-auto text-left text-sm">
  //             <code>{JSON.stringify(kb, null, 2)}</code>
  //           </pre>
  //         </div>
  //       </CardContent>
  //     </Card>
  //   </div>
  // );
};

export default KnowledgeBaseClient;
