"use client";

import Spinner from "@/components/shared/Spinner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dictionary } from "@/contexts/dictionary-context";
import { saveSiteContent } from "@/lib/actions/siteContent";
import { SupportedLang } from "@/lib/dictionaries";
import { SiteContent, SiteContentSchema } from "@/lib/schemas/content";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";

interface Props {
  lang: SupportedLang;
  dict: Dictionary;
  initialContentEn?: SiteContent | null;
  initialContentAr?: SiteContent | null;
}

export default function ContentClient({
  lang,
  dict,
  initialContentEn,
  initialContentAr,
}: Props) {
  const t = dict.admin_content;

  // helper to format strings like "Feature {n}"
  const fmt = (s?: string, n?: number) =>
    (s ?? "").replace("{n}", n != null ? String(n) : "{n}");

  const form = useForm<SiteContent>({
    resolver: zodResolver(SiteContentSchema),
    defaultValues:
      lang === "en" ? (initialContentEn ?? {}) : (initialContentAr ?? {}),
  });
  const {
    formState: { isValid, isDirty, isSubmitting: saving },
  } = form;

  async function onSubmit(values: SiteContent) {
    try {
      await saveSiteContent({ lang, content: values });
      toast.success(t.save_success);
    } catch (err) {
      console.error("Save failed", err);
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`${t.save_failed}: ${message}`);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t.title}</h1>
            <p className="text-muted-foreground pt-2 text-sm">
              {t.description}
            </p>
          </div>

          <Button type="submit" disabled={saving || !isValid || !isDirty}>
            {saving ? (
              <>
                <Spinner /> {t.saving}
              </>
            ) : (
              t.save
            )}
          </Button>
        </div>

        {/* Hero Section */}
        <Card>
          <CardHeader>
            <CardTitle>{t.sections.hero}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="hero.title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.hero.title}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t.fields.hero.title} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="hero.subtitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.hero.subtitle}</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder={t.fields.hero.subtitle} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2">
              <FormField
                control={form.control}
                name="hero.button1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.fields.hero.button1}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t.fields.hero.button1} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="hero.button2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.fields.hero.button2}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t.fields.hero.button2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Features */}
        <Card>
          <CardHeader>
            <CardTitle>{t.sections.features}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="features.title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.features.title}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t.fields.features.title} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="features.subtitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.features.subtitle}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder={t.fields.features.subtitle}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <FormField
                  key={i}
                  control={form.control}
                  name={`features.features.${i}.title`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {fmt(t.fields.features.feature, i + 1)}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={fmt(t.fields.features.feature, i + 1)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* How it Works */}
        <Card>
          <CardHeader>
            <CardTitle>{t.sections.how_it_works}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="howItWorks.title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.how_it_works.title}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={t.fields.how_it_works.title}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-4">
                <FormField
                  control={form.control}
                  name={`howItWorks.steps.${i}.title`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {fmt(t.fields.how_it_works.step_title, i + 1)}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={fmt(
                            t.fields.how_it_works.step_title,
                            i + 1,
                          )}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`howItWorks.steps.${i}.text`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {fmt(t.fields.how_it_works.step_text, i + 1)}
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder={fmt(
                            t.fields.how_it_works.step_text,
                            i + 1,
                          )}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Testimonials */}
        <Card>
          <CardHeader>
            <CardTitle>{t.sections.testimonials}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="testimonials.pill"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.testimonials.pill}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={t.fields.testimonials.pill}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="testimonials.title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.testimonials.title}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={t.fields.testimonials.title}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="testimonials.subtitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.testimonials.subtitle}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder={t.fields.testimonials.subtitle}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-4">
                <FormField
                  control={form.control}
                  name={`testimonials.items.${i}.text`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {fmt(t.fields.testimonials.item_text, i + 1)}
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder={fmt(
                            t.fields.testimonials.item_text,
                            i + 1,
                          )}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2">
                  <FormField
                    control={form.control}
                    name={`testimonials.items.${i}.name`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t.fields.testimonials.name}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={t.fields.testimonials.name}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`testimonials.items.${i}.title`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t.fields.testimonials.job}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={t.fields.testimonials.job}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Contact */}
        <Card>
          <CardHeader>
            <CardTitle>{t.sections.contact}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="contact.title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.contact.title}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t.fields.contact.title} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contact.subtitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.contact.subtitle}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder={t.fields.contact.subtitle}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="contact.emailCardTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.fields.contact.email_title}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t.fields.contact.email_title}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact.emailCardDesc"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.fields.contact.email_desc}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t.fields.contact.email_desc}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact.phoneCardTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.fields.contact.phone_title}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t.fields.contact.phone_title}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact.phoneCardDesc"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.fields.contact.phone_desc}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t.fields.contact.phone_desc}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact.addressCardTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.fields.contact.address_title}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t.fields.contact.address_title}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact.chatCardTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.fields.contact.chat_title}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t.fields.contact.chat_title}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="contact.chatCardDesc"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.contact.chat_desc}</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder={t.fields.contact.chat_desc}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contact.chatButtonText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.contact.chat_button}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={t.fields.contact.chat_button}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* FAQ */}
        <Card>
          <CardHeader>
            <CardTitle>{t.sections.faq}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="faq.title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.faq.title}</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder={t.fields.faq.title} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="faq.subtitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.faq.subtitle}</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder={t.fields.faq.subtitle} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-4">
                <FormField
                  control={form.control}
                  name={`faq.items.${i}.question`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{fmt(t.fields.faq.question, i + 1)}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={fmt(t.fields.faq.question, i + 1)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`faq.items.${i}.answer`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{fmt(t.fields.faq.answer, i + 1)}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder={fmt(t.fields.faq.answer, i + 1)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Footer */}
        <Card>
          <CardHeader>
            <CardTitle>{t.sections.footer}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="footer.aboutText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.fields.footer.about}</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder={t.fields.footer.about} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="footer.contactEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.fields.footer.email}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t.fields.footer.email} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="footer.contactPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.fields.footer.phone}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t.fields.footer.phone} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="footer.contactAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.fields.footer.address}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t.fields.footer.address} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="footer.copyright"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.fields.footer.copyright}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t.fields.footer.copyright}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="mt-2 grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="footer.social.facebook"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.fields.footer.facebook}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t.fields.footer.facebook}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="footer.social.twitter"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.fields.footer.twitter}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t.fields.footer.twitter} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="footer.social.instagram"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t.fields.footer.instagram}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t.fields.footer.instagram}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={saving || !isValid || !isDirty}>
            {saving ? (
              <>
                <Spinner /> {t.saving}
              </>
            ) : (
              t.save
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
