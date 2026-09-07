import { z } from "zod";

const slug = z.string();

export const formSlugOutputSchema = {
  slug,
};

export const formListSlugOutputSchema = {
  forms: z.array(z.object({ slug }).passthrough()),
};

export const eventTypeSlugOutputSchema = {
  slug,
};

export const eventTypeListSlugOutputSchema = {
  eventTypes: z.array(z.object({ slug }).passthrough()),
};

export const eventTypeDetailSlugOutputSchema = z
  .object({
    eventType: z.object({ slug }).passthrough(),
  })
  .passthrough();

export const projectSlugOutputSchema = {
  slug,
};
