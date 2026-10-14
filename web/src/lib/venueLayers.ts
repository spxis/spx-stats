import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import type { FutureRow, SpringRow } from "./venueLayerRows";

/* The spring training parks (api.spring_training_venue, migration 070) and the future venues (api.future_venue, migration 074). If a view cannot be read the
   layer is empty and /venues shows the home venues alone. */

const span = z.object({ from: z.number().nullable(), to: z.number().nullable() });
const spring = z.object({
  wikidata_id: z.string(), name: z.string(), league: z.string(), city: z.string().nullable(), region: z.string().nullable(), country_code: z.string().nullable(),
  latitude: z.number().nullable(), longitude: z.number().nullable(), opened_year: z.number().nullable(), closed_year: z.number().nullable(), capacity: z.number().nullable(),
  wikipedia_title: z.string().nullable(), first_year: z.number().nullable(), last_year: z.number().nullable(), in_use: z.boolean(),
  tenants: z.array(span.extend({ franchise_id: z.number().nullable(), club: z.string() })),
  names: z.array(span.extend({ name: z.string() })),
});
const future = z.object({
  wikidata_id: z.string().nullable(), venue_key: z.string(), name: z.string(), status: z.string(), planned_open_year: z.number().nullable(), capacity: z.number().nullable(),
  latitude: z.number().nullable(), longitude: z.number().nullable(), city: z.string().nullable(), region: z.string().nullable(), country_code: z.string().nullable(),
  replaces_venue_name: z.string().nullable(), wikipedia_title: z.string().nullable(),
  clubs: z.array(z.object({ club: z.string(), league: z.string(), franchise_id: z.number().nullable() })),
});

export const getSpringParks = cache(async (): Promise<SpringRow[]> => {
  try {
    return await rows("spring_training_venue", "select=wikidata_id,name,league,city,region,country_code,latitude,longitude,opened_year,closed_year,capacity,wikipedia_title,first_year,last_year,in_use,tenants,names&order=wikidata_id", spring);
  } catch {
    return [];
  }
});

export const getFutureVenues = cache(async (): Promise<FutureRow[]> => {
  try {
    return await rows("future_venue", "select=wikidata_id,venue_key,name,status,planned_open_year,capacity,latitude,longitude,city,region,country_code,replaces_venue_name,wikipedia_title,clubs&order=venue_key", future);
  } catch {
    return [];
  }
});
