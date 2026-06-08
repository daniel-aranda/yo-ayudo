import { config } from "../app/config.js";

const provider_order = ["google_places", "yelp_fusion", "serpapi_google_local"];

function clamp_limit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10;
  }

  return Math.min(Math.max(Math.floor(parsed), 1), 20);
}

function compact_string(value) {
  return String(value ?? "").trim();
}

function compact_number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function provider_keys(options = {}) {
  return {
    google_places: options.google_places_api_key ?? config.google_places_api_key,
    yelp_fusion: options.yelp_fusion_api_key ?? config.yelp_fusion_api_key,
    serpapi_google_local: options.serpapi_api_key ?? config.serpapi_api_key,
  };
}

function selected_providers(input, keys) {
  const requested = Array.isArray(input.providers) && input.providers.length
    ? input.providers
    : provider_order;

  return requested.filter((provider) => provider_order.includes(provider) && keys[provider]);
}

function normalize_result(result) {
  return {
    provider: result.provider,
    provider_business_id: compact_string(result.provider_business_id) || null,
    name: compact_string(result.name),
    category: compact_string(result.category) || null,
    address: compact_string(result.address) || null,
    phone: compact_string(result.phone) || null,
    website: compact_string(result.website) || null,
    maps_url: compact_string(result.maps_url) || null,
    rating: compact_number(result.rating),
    reviews_count: compact_number(result.reviews_count),
    latitude: compact_number(result.latitude),
    longitude: compact_number(result.longitude),
    source_url: compact_string(result.source_url) || null,
    raw: result.raw ?? {},
  };
}

function dedupe_results(results) {
  const by_key = new Map();

  for (const result of results.map(normalize_result).filter((item) => item.name)) {
    const key = [
      result.name.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, ""),
      String(result.address ?? "").toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, ""),
    ].join("|");

    if (!by_key.has(key)) {
      by_key.set(key, result);
      continue;
    }

    const current = by_key.get(key);
    const merged_reviews_count = Math.max(current.reviews_count ?? 0, result.reviews_count ?? 0) || null;
    by_key.set(key, {
      ...current,
      phone: current.phone ?? result.phone,
      website: current.website ?? result.website,
      maps_url: current.maps_url ?? result.maps_url,
      rating: current.rating ?? result.rating,
      reviews_count: merged_reviews_count ?? current.reviews_count ?? result.reviews_count,
      raw: {
        ...current.raw,
        alternate_sources: [...(current.raw.alternate_sources ?? []), { provider: result.provider, raw: result.raw }],
      },
    });
  }

  return [...by_key.values()];
}

function google_location_bias(input) {
  const latitude = compact_number(input.latitude);
  const longitude = compact_number(input.longitude);

  if (latitude === null || longitude === null) {
    return undefined;
  }

  return {
    circle: {
      center: { latitude, longitude },
      radius: compact_number(input.radius_meters) ?? 5000,
    },
  };
}

async function search_google_places(input, key, fetcher) {
  const body = {
    textQuery: [input.query, input.location].filter(Boolean).join(" en "),
    languageCode: input.language_code ?? "es",
    regionCode: input.region_code ?? "MX",
    maxResultCount: input.limit,
  };
  const location_bias = google_location_bias(input);

  if (location_bias) {
    body.locationBias = location_bias;
  }

  const response = await fetcher("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.rating",
        "places.userRatingCount",
        "places.websiteUri",
        "places.nationalPhoneNumber",
        "places.internationalPhoneNumber",
        "places.googleMapsUri",
        "places.businessStatus",
        "places.types",
        "places.location",
      ].join(","),
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Google Places respondió ${response.status}`);
  }

  return (payload.places ?? []).map((place) => ({
    provider: "google_places",
    provider_business_id: place.id,
    name: place.displayName?.text,
    category: place.types?.[0],
    address: place.formattedAddress,
    phone: place.internationalPhoneNumber ?? place.nationalPhoneNumber,
    website: place.websiteUri,
    maps_url: place.googleMapsUri,
    rating: place.rating,
    reviews_count: place.userRatingCount,
    latitude: place.location?.latitude,
    longitude: place.location?.longitude,
    source_url: place.googleMapsUri,
    raw: place,
  }));
}

async function search_yelp_fusion(input, key, fetcher) {
  const url = new URL("https://api.yelp.com/v3/businesses/search");
  url.searchParams.set("term", input.query);
  url.searchParams.set("limit", String(input.limit));

  if (input.latitude !== null && input.longitude !== null) {
    url.searchParams.set("latitude", String(input.latitude));
    url.searchParams.set("longitude", String(input.longitude));
  } else {
    url.searchParams.set("location", input.location);
  }

  if (input.radius_meters) {
    url.searchParams.set("radius", String(Math.min(Number(input.radius_meters), 40000)));
  }

  const response = await fetcher(url, {
    headers: {
      Authorization: `Bearer ${key}`,
    },
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.description ?? `Yelp Fusion respondió ${response.status}`);
  }

  return (payload.businesses ?? []).map((business) => ({
    provider: "yelp_fusion",
    provider_business_id: business.id,
    name: business.name,
    category: business.categories?.[0]?.title,
    address: business.location?.display_address?.join(", "),
    phone: business.phone || business.display_phone,
    website: business.url,
    rating: business.rating,
    reviews_count: business.review_count,
    latitude: business.coordinates?.latitude,
    longitude: business.coordinates?.longitude,
    source_url: business.url,
    raw: business,
  }));
}

async function search_serpapi_google_local(input, key, fetcher) {
  const url = new URL("https://serpapi.com/search");
  url.searchParams.set("engine", "google_local");
  url.searchParams.set("q", input.query);
  url.searchParams.set("location", input.location);
  url.searchParams.set("hl", input.language_code ?? "es");
  url.searchParams.set("gl", String(input.region_code ?? "mx").toLowerCase());
  url.searchParams.set("api_key", key);

  const response = await fetcher(url);
  const payload = await response.json();

  if (!response.ok || payload.error) {
    throw new Error(payload.error ?? `SerpApi respondió ${response.status}`);
  }

  return (payload.local_results ?? []).slice(0, input.limit).map((business) => ({
    provider: "serpapi_google_local",
    provider_business_id: business.place_id ?? business.data_id,
    name: business.title,
    category: business.type,
    address: business.address,
    phone: business.phone,
    website: business.website,
    maps_url: business.place_id_search,
    rating: business.rating,
    reviews_count: business.reviews,
    source_url: business.place_id_search,
    raw: business,
  }));
}

async function search_provider(provider, input, key, fetcher) {
  if (provider === "google_places") {
    return search_google_places(input, key, fetcher);
  }

  if (provider === "yelp_fusion") {
    return search_yelp_fusion(input, key, fetcher);
  }

  if (provider === "serpapi_google_local") {
    return search_serpapi_google_local(input, key, fetcher);
  }

  return [];
}

export async function search_business_prospects(input = {}, options = {}) {
  const query = compact_string(input.query ?? input.giro ?? input.termino);
  const location = compact_string(input.location ?? input.ubicacion);
  const normalized_input = {
    ...input,
    query,
    location,
    latitude: compact_number(input.latitude),
    longitude: compact_number(input.longitude),
    radius_meters: compact_number(input.radius_meters ?? input.radio_metros),
    limit: clamp_limit(input.max_results ?? input.limit),
  };

  if (!query || (!location && (normalized_input.latitude === null || normalized_input.longitude === null))) {
    return {
      status: "failed",
      message: "Falta query y location, o latitude/longitude, para buscar negocios.",
      providers_used: [],
      provider_errors: [],
      businesses: [],
    };
  }

  const keys = provider_keys(options);
  const providers = selected_providers(normalized_input, keys);

  if (!providers.length) {
    return {
      status: "pending_provider",
      message: "Configura GOOGLE_PLACES_API_KEY, YELP_FUSION_API_KEY o SERPAPI_API_KEY para buscar negocios.",
      providers_used: [],
      provider_errors: [],
      businesses: [],
    };
  }

  const fetcher = options.fetcher ?? fetch;
  const provider_errors = [];
  const provider_results = [];

  for (const provider of providers) {
    try {
      provider_results.push(...(await search_provider(provider, normalized_input, keys[provider], fetcher)));
    } catch (error) {
      provider_errors.push({
        provider,
        message: error.message,
      });
    }
  }

  const businesses = dedupe_results(provider_results).slice(0, normalized_input.limit);

  return {
    status: businesses.length ? "executed" : provider_errors.length ? "failed" : "executed",
    message: businesses.length
      ? `Se encontraron ${businesses.length} negocios.`
      : "No se encontraron negocios con los proveedores configurados.",
    providers_used: providers,
    provider_errors,
    businesses,
  };
}
