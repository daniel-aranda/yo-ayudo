import { describe, expect, it } from "vitest";
import { search_business_prospects } from "../../src/prospecting/business_search_service.js";

function json_response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}

describe("business search service", () => {
  it("maps configured prospecting providers into a normalized business list", async () => {
    const requests = [];
    const fetcher = async (url, options = {}) => {
      requests.push({ url: String(url), options });

      if (String(url).includes("places.googleapis.com")) {
        return json_response({
          places: [
            {
              id: "places_1",
              displayName: { text: "Clinica Dental Roma" },
              formattedAddress: "Col Roma, CDMX",
              rating: 4.7,
              userRatingCount: 84,
              nationalPhoneNumber: "55 1111 2222",
              websiteUri: "https://clinicaroma.example",
              googleMapsUri: "https://maps.example/clinica",
              types: ["dentist"],
              location: { latitude: 19.41, longitude: -99.16 },
            },
          ],
        });
      }

      return json_response({
        businesses: [
          {
            id: "yelp_1",
            name: "Clinica Dental Roma",
            rating: 4.5,
            review_count: 70,
            phone: "+525511112222",
            url: "https://yelp.example/clinica",
            categories: [{ title: "Dentists" }],
            location: { display_address: ["Col Roma", "CDMX"] },
            coordinates: { latitude: 19.41, longitude: -99.16 },
          },
        ],
      });
    };

    const result = await search_business_prospects(
      {
        query: "dentistas",
        location: "Roma Norte, CDMX",
        max_results: 5,
        providers: ["google_places", "yelp_fusion"],
      },
      {
        google_places_api_key: "google-test-key",
        yelp_fusion_api_key: "yelp-test-key",
        fetcher,
      },
    );

    expect(result.status).toBe("executed");
    expect(result.providers_used).toEqual(["google_places", "yelp_fusion"]);
    expect(result.businesses).toHaveLength(1);
    expect(result.businesses[0]).toMatchObject({
      provider: "google_places",
      provider_business_id: "places_1",
      name: "Clinica Dental Roma",
      address: "Col Roma, CDMX",
      phone: "55 1111 2222",
      website: "https://clinicaroma.example",
      rating: 4.7,
      reviews_count: 84,
    });
    expect(requests[0].options.headers["X-Goog-Api-Key"]).toBe("google-test-key");
    expect(requests[1].options.headers.Authorization).toBe("Bearer yelp-test-key");
  });

  it("returns pending_provider when no prospecting API key is configured", async () => {
    const result = await search_business_prospects({
      query: "restaurantes",
      location: "Guadalajara",
      providers: ["google_places"],
    }, {
      google_places_api_key: "",
      yelp_fusion_api_key: "",
      serpapi_api_key: "",
    });

    expect(result).toMatchObject({
      status: "pending_provider",
      providers_used: [],
      businesses: [],
    });
  });
});
