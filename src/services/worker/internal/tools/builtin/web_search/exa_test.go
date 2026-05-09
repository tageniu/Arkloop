package websearch

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestParseExaArgsValidatesProviderContract(t *testing.T) {
	tests := []struct {
		name string
		args map[string]any
	}{
		{
			name: "rejects queries",
			args: map[string]any{"queries": []any{"arkloop"}},
		},
		{
			name: "rejects unknown field",
			args: map[string]any{"query": "arkloop", "max_results": 3},
		},
		{
			name: "rejects invalid type",
			args: map[string]any{"query": "arkloop", "type": "keyword"},
		},
		{
			name: "rejects freshness with dates",
			args: map[string]any{"query": "arkloop", "freshness": "week", "date_after": "2026-01-01"},
		},
		{
			name: "rejects invalid date",
			args: map[string]any{"query": "arkloop", "date_after": "2026-13-01"},
		},
		{
			name: "rejects reversed dates",
			args: map[string]any{"query": "arkloop", "date_after": "2026-02-01", "date_before": "2026-01-01"},
		},
		{
			name: "rejects invalid contents",
			args: map[string]any{"query": "arkloop", "contents": map[string]any{"highlights": map[string]any{"maxCharacters": float64(0)}}},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := parseExaArgs(tc.args)
			if err == nil {
				t.Fatal("expected validation error")
			}
			if err.ErrorClass != errorArgsInvalid {
				t.Fatalf("unexpected error class: %s", err.ErrorClass)
			}
		})
	}
}

func TestParseExaArgsDefaultsAndContents(t *testing.T) {
	params, err := parseExaArgs(map[string]any{
		"query": "  arkloop  ",
		"count": float64(2),
		"type":  "neural",
		"contents": map[string]any{
			"highlights": map[string]any{"maxCharacters": float64(120), "query": "agent"},
			"text":       true,
			"summary":    map[string]any{"query": "runtime"},
		},
	})
	if err != nil {
		t.Fatalf("parseExaArgs returned error: %v", err)
	}
	if params.Query != "arkloop" || params.Count != 2 || params.Type != "neural" {
		t.Fatalf("unexpected params: %+v", params)
	}
	highlights, ok := params.Contents["highlights"].(map[string]any)
	if !ok || highlights["maxCharacters"] != 120 || highlights["query"] != "agent" {
		t.Fatalf("unexpected highlights contents: %#v", params.Contents["highlights"])
	}

	defaulted, err := parseExaArgs(map[string]any{"query": "arkloop"})
	if err != nil {
		t.Fatalf("parseExaArgs default returned error: %v", err)
	}
	if defaulted.Count != defaultMaxResults || defaulted.Type != "auto" {
		t.Fatalf("unexpected defaults: %+v", defaulted)
	}
	if defaulted.Contents["highlights"] != true {
		t.Fatalf("expected default highlights=true, got %#v", defaulted.Contents)
	}
}

func TestExaProviderSearchPostsContractAndParsesResponse(t *testing.T) {
	var gotPath string
	var gotAPIKey string
	var gotBody map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAPIKey = r.Header.Get("x-api-key")
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", r.Method)
		}
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"results": [
				{
					"title": " Arkloop ",
					"url": "https://arkloop.example/docs",
					"siteName": "Arkloop Docs",
					"publishedDate": "2026-01-02",
					"highlights": [" first highlight ", "second highlight"],
					"highlightScores": [0.9, 0.8],
					"summary": "Summary",
					"text": "Full text body"
				},
				{"title": "", "url": "https://skip.example"}
			]
		}`))
	}))
	defer server.Close()

	provider := NewExaProvider("exa-key", server.URL+"/v1")
	results, err := provider.Search(context.Background(), SearchRequest{Args: map[string]any{
		"query":       "arkloop",
		"count":       float64(1),
		"type":        "neural",
		"date_after":  "2026-01-01",
		"date_before": "2026-01-31",
		"contents":    map[string]any{"highlights": true},
	}})
	if err != nil {
		t.Fatalf("Search returned error: %v", err)
	}
	if gotPath != "/v1/search" {
		t.Fatalf("unexpected path: %s", gotPath)
	}
	if gotAPIKey != "exa-key" {
		t.Fatalf("unexpected api key header: %q", gotAPIKey)
	}
	if gotBody["query"] != "arkloop" || gotBody["numResults"] != float64(1) || gotBody["type"] != "neural" {
		t.Fatalf("unexpected request body: %#v", gotBody)
	}
	if gotBody["startPublishedDate"] != "2026-01-01" || gotBody["endPublishedDate"] != "2026-01-31" {
		t.Fatalf("unexpected date filters: %#v", gotBody)
	}
	if len(results) != 1 {
		t.Fatalf("expected one normalized result, got %d", len(results))
	}
	if results[0].Title != "Arkloop" || results[0].SiteName != "Arkloop Docs" || results[0].Published != "2026-01-02" {
		t.Fatalf("unexpected result: %+v", results[0])
	}
	if !strings.Contains(results[0].Snippet, "first highlight") {
		t.Fatalf("expected highlight snippet, got %q", results[0].Snippet)
	}
	if len(results[0].HighlightScores) != 2 || results[0].HighlightScores[0] != 0.9 {
		t.Fatalf("unexpected highlight scores: %#v", results[0].HighlightScores)
	}
	if results[0].Summary != "Summary" || results[0].Text != "Full text body" {
		t.Fatalf("expected summary and text, got summary=%q text=%q", results[0].Summary, results[0].Text)
	}
}

func TestExaFreshnessUsesCalendarBoundaries(t *testing.T) {
	marchEnd := timeDate(t, "2026-03-31T12:00:00Z")
	if got := resolveExaFreshnessStartDate("month", marchEnd); got != "2026-02-28T12:00:00Z" {
		t.Fatalf("unexpected month freshness: %s", got)
	}

	leapBoundary := timeDate(t, "2024-03-01T12:00:00Z")
	if got := resolveExaFreshnessStartDate("year", leapBoundary); got != "2023-03-01T12:00:00Z" {
		t.Fatalf("unexpected year freshness: %s", got)
	}
}

func TestExaResultJSONPreservesExtractedText(t *testing.T) {
	longText := strings.Repeat("section ", 200)
	payload := Result{
		Title:   "Title",
		URL:     "https://example.com",
		Snippet: longText,
		Summary: longText,
		Text:    longText,
	}.ToJSON()

	if got := payload["snippet"].(string); len(got) >= len(longText) {
		t.Fatalf("expected compact snippet, got len=%d", len(got))
	}
	if got := payload["summary"].(string); got != strings.TrimSpace(longText) {
		t.Fatalf("expected full summary, got len=%d", len(got))
	}
	if got := payload["text"].(string); got != strings.TrimSpace(longText) {
		t.Fatalf("expected full text, got len=%d", len(got))
	}
}

func timeDate(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		t.Fatalf("parse time: %v", err)
	}
	return parsed
}
