package websearch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	sharedoutbound "arkloop/services/shared/outboundurl"
	"arkloop/services/worker/internal/tools"
)

const (
	exaDefaultEndpoint = "https://api.exa.ai/search"
	exaMaxSearchCount  = 100
)

var exaSearchTypes = map[string]struct{}{
	"auto":           {},
	"neural":         {},
	"fast":           {},
	"deep":           {},
	"deep-reasoning": {},
	"instant":        {},
}

var exaFreshnessValues = map[string]struct{}{
	"day":   {},
	"week":  {},
	"month": {},
	"year":  {},
}

type ExaProvider struct {
	apiKey      string
	endpoint    string
	endpointErr error
	client      *http.Client
}

func NewExaProvider(apiKey string, baseURL string) *ExaProvider {
	endpoint, err := resolveExaSearchEndpoint(baseURL)
	return &ExaProvider{
		apiKey:      strings.TrimSpace(apiKey),
		endpoint:    endpoint,
		endpointErr: err,
		client:      sharedoutbound.DefaultPolicy().NewHTTPClient(15 * time.Second),
	}
}

func (p *ExaProvider) ParseSearchRequests(args map[string]any) ([]SearchRequest, *tools.ExecutionError) {
	params, err := parseExaArgs(args)
	if err != nil {
		return nil, err
	}
	return []SearchRequest{{
		Query:      params.Query,
		MaxResults: params.Count,
		Args:       args,
	}}, nil
}

func (p *ExaProvider) Search(ctx context.Context, request SearchRequest) ([]Result, error) {
	if p.endpointErr != nil {
		return nil, p.endpointErr
	}
	if p.apiKey == "" {
		return nil, fmt.Errorf("missing Exa api_key")
	}
	params, execErr := parseExaArgs(request.Args)
	if execErr != nil {
		return nil, execErr
	}

	body := map[string]any{
		"query":      params.Query,
		"numResults": params.Count,
		"type":       params.Type,
		"contents":   params.Contents,
	}
	if params.DateAfter != "" {
		body["startPublishedDate"] = params.DateAfter
	} else if params.Freshness != "" {
		body["startPublishedDate"] = resolveExaFreshnessStartDate(params.Freshness, time.Now().UTC())
	}
	if params.DateBefore != "" {
		body["endPublishedDate"] = params.DateBefore
	}

	encoded, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.endpoint, bytes.NewReader(encoded))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", p.apiKey)
	req.Header.Set("x-exa-integration", "arkloop")

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()

	responseBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, HttpError{StatusCode: resp.StatusCode, Body: string(responseBody)}
	}

	var parsed exaSearchResponse
	if err := json.Unmarshal(responseBody, &parsed); err != nil {
		return nil, err
	}

	out := make([]Result, 0, len(parsed.Results))
	for _, item := range parsed.Results {
		if len(out) >= params.Count {
			break
		}
		title := strings.TrimSpace(item.Title)
		urlText := strings.TrimSpace(item.URL)
		if title == "" || urlText == "" {
			continue
		}
		out = append(out, Result{
			Title:           title,
			URL:             urlText,
			Snippet:         exaDescription(item),
			Published:       strings.TrimSpace(item.PublishedDate),
			SiteName:        exaSiteName(item, urlText),
			Summary:         strings.TrimSpace(item.Summary),
			Text:            strings.TrimSpace(item.Text),
			HighlightScores: append([]float64{}, item.HighlightScores...),
		})
	}
	return out, nil
}

type exaParams struct {
	Query      string
	Count      int
	Freshness  string
	DateAfter  string
	DateBefore string
	Type       string
	Contents   map[string]any
}

type exaSearchResponse struct {
	Results []exaSearchResult `json:"results"`
}

type exaSearchResult struct {
	Title           string    `json:"title"`
	URL             string    `json:"url"`
	SiteName        string    `json:"siteName"`
	PublishedDate   string    `json:"publishedDate"`
	Highlights      []string  `json:"highlights"`
	HighlightScores []float64 `json:"highlightScores"`
	Summary         string    `json:"summary"`
	Text            string    `json:"text"`
}

func parseExaArgs(args map[string]any) (exaParams, *tools.ExecutionError) {
	for key := range args {
		switch key {
		case "query", "count", "freshness", "date_after", "date_before", "type", "contents":
		default:
			return exaParams{}, &tools.ExecutionError{
				ErrorClass: errorArgsInvalid,
				Message:    "tool arguments do not allow extra fields",
				Details:    map[string]any{"unknown_fields": []string{key}},
			}
		}
	}

	query, ok := args["query"].(string)
	query = strings.TrimSpace(query)
	if !ok || query == "" {
		return exaParams{}, &tools.ExecutionError{
			ErrorClass: errorArgsInvalid,
			Message:    "parameter query must be a non-empty string",
			Details:    map[string]any{"field": "query"},
		}
	}

	count, err := parseExaCount(args["count"])
	if err != nil {
		return exaParams{}, err
	}
	searchType := "auto"
	if rawType, ok := args["type"].(string); ok && strings.TrimSpace(rawType) != "" {
		searchType = strings.TrimSpace(rawType)
	}
	if _, ok := exaSearchTypes[searchType]; !ok {
		return exaParams{}, &tools.ExecutionError{
			ErrorClass: errorArgsInvalid,
			Message:    "parameter type is not supported",
			Details:    map[string]any{"field": "type"},
		}
	}

	freshness := ""
	if rawFreshness, ok := args["freshness"].(string); ok && strings.TrimSpace(rawFreshness) != "" {
		freshness = strings.TrimSpace(rawFreshness)
	}
	if freshness != "" {
		if _, ok := exaFreshnessValues[freshness]; !ok {
			return exaParams{}, &tools.ExecutionError{
				ErrorClass: errorArgsInvalid,
				Message:    "parameter freshness is not supported",
				Details:    map[string]any{"field": "freshness"},
			}
		}
	}

	dateAfter, err := parseOptionalDate(args["date_after"], "date_after")
	if err != nil {
		return exaParams{}, err
	}
	dateBefore, err := parseOptionalDate(args["date_before"], "date_before")
	if err != nil {
		return exaParams{}, err
	}
	if freshness != "" && (dateAfter != "" || dateBefore != "") {
		return exaParams{}, &tools.ExecutionError{
			ErrorClass: errorArgsInvalid,
			Message:    "freshness cannot be combined with date_after or date_before",
			Details:    map[string]any{"fields": []string{"freshness", "date_after", "date_before"}},
		}
	}
	if dateAfter != "" && dateBefore != "" && dateAfter > dateBefore {
		return exaParams{}, &tools.ExecutionError{
			ErrorClass: errorArgsInvalid,
			Message:    "date_after must be earlier than or equal to date_before",
			Details:    map[string]any{"fields": []string{"date_after", "date_before"}},
		}
	}

	contents, err := parseExaContents(args["contents"])
	if err != nil {
		return exaParams{}, err
	}
	if contents == nil {
		contents = map[string]any{"highlights": true}
	}

	return exaParams{
		Query:      query,
		Count:      count,
		Freshness:  freshness,
		DateAfter:  dateAfter,
		DateBefore: dateBefore,
		Type:       searchType,
		Contents:   contents,
	}, nil
}

func resolveExaFreshnessStartDate(freshness string, now time.Time) string {
	now = now.UTC()
	switch freshness {
	case "day":
		return now.AddDate(0, 0, -1).Format(time.RFC3339)
	case "week":
		return now.AddDate(0, 0, -7).Format(time.RFC3339)
	case "month":
		currentDay := now.Day()
		targetMonth := time.Date(now.Year(), now.Month(), 1, now.Hour(), now.Minute(), now.Second(), now.Nanosecond(), time.UTC).AddDate(0, -1, 0)
		lastDay := time.Date(targetMonth.Year(), targetMonth.Month()+1, 0, now.Hour(), now.Minute(), now.Second(), now.Nanosecond(), time.UTC).Day()
		if currentDay > lastDay {
			currentDay = lastDay
		}
		return time.Date(targetMonth.Year(), targetMonth.Month(), currentDay, now.Hour(), now.Minute(), now.Second(), now.Nanosecond(), time.UTC).Format(time.RFC3339)
	case "year":
		return now.AddDate(-1, 0, 0).Format(time.RFC3339)
	default:
		return now.Format(time.RFC3339)
	}
}

func parseExaCount(raw any) (int, *tools.ExecutionError) {
	if raw == nil {
		return defaultMaxResults, nil
	}
	var count int
	switch typed := raw.(type) {
	case int:
		count = typed
	case float64:
		count = int(typed)
		if typed != float64(count) {
			return 0, &tools.ExecutionError{ErrorClass: errorArgsInvalid, Message: "parameter count must be an integer", Details: map[string]any{"field": "count"}}
		}
	default:
		return 0, &tools.ExecutionError{ErrorClass: errorArgsInvalid, Message: "parameter count must be an integer", Details: map[string]any{"field": "count"}}
	}
	if count <= 0 || count > exaMaxSearchCount {
		return 0, &tools.ExecutionError{ErrorClass: errorArgsInvalid, Message: fmt.Sprintf("parameter count must be in range 1..%d", exaMaxSearchCount), Details: map[string]any{"field": "count", "max": exaMaxSearchCount}}
	}
	return count, nil
}

func parseOptionalDate(raw any, field string) (string, *tools.ExecutionError) {
	if raw == nil {
		return "", nil
	}
	value, ok := raw.(string)
	value = strings.TrimSpace(value)
	if !ok || value == "" {
		return "", &tools.ExecutionError{ErrorClass: errorArgsInvalid, Message: "date parameter must be YYYY-MM-DD", Details: map[string]any{"field": field}}
	}
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil || parsed.Format("2006-01-02") != value {
		return "", &tools.ExecutionError{ErrorClass: errorArgsInvalid, Message: "date parameter must be YYYY-MM-DD", Details: map[string]any{"field": field}}
	}
	return value, nil
}

func parseExaContents(raw any) (map[string]any, *tools.ExecutionError) {
	if raw == nil {
		return nil, nil
	}
	obj, ok := raw.(map[string]any)
	if !ok {
		return nil, &tools.ExecutionError{ErrorClass: errorArgsInvalid, Message: "parameter contents must be an object", Details: map[string]any{"field": "contents"}}
	}
	out := map[string]any{}
	for key, value := range obj {
		switch key {
		case "text":
			parsed, err := parseExaTextContents(value)
			if err != nil {
				return nil, err
			}
			out[key] = parsed
		case "highlights":
			parsed, err := parseExaHighlightsContents(value)
			if err != nil {
				return nil, err
			}
			out[key] = parsed
		case "summary":
			parsed, err := parseExaSummaryContents(value)
			if err != nil {
				return nil, err
			}
			out[key] = parsed
		default:
			return nil, &tools.ExecutionError{ErrorClass: errorArgsInvalid, Message: "contents has unknown field", Details: map[string]any{"field": "contents." + key}}
		}
	}
	if len(out) == 0 {
		return nil, nil
	}
	return out, nil
}

func parseExaTextContents(value any) (any, *tools.ExecutionError) {
	if boolValue, ok := value.(bool); ok {
		return boolValue, nil
	}
	obj, ok := value.(map[string]any)
	if !ok {
		return nil, &tools.ExecutionError{ErrorClass: errorArgsInvalid, Message: "contents.text must be a boolean or object", Details: map[string]any{"field": "contents.text"}}
	}
	return parsePositiveIntegerObject(obj, "contents.text", map[string]struct{}{"maxCharacters": {}})
}

func parseExaHighlightsContents(value any) (any, *tools.ExecutionError) {
	if boolValue, ok := value.(bool); ok {
		return boolValue, nil
	}
	obj, ok := value.(map[string]any)
	if !ok {
		return nil, &tools.ExecutionError{ErrorClass: errorArgsInvalid, Message: "contents.highlights must be a boolean or object", Details: map[string]any{"field": "contents.highlights"}}
	}
	return parsePositiveIntegerObject(obj, "contents.highlights", map[string]struct{}{"maxCharacters": {}, "query": {}, "numSentences": {}, "highlightsPerUrl": {}})
}

func parseExaSummaryContents(value any) (any, *tools.ExecutionError) {
	if boolValue, ok := value.(bool); ok {
		return boolValue, nil
	}
	obj, ok := value.(map[string]any)
	if !ok {
		return nil, &tools.ExecutionError{ErrorClass: errorArgsInvalid, Message: "contents.summary must be a boolean or object", Details: map[string]any{"field": "contents.summary"}}
	}
	return parsePositiveIntegerObject(obj, "contents.summary", map[string]struct{}{"query": {}})
}

func parsePositiveIntegerObject(obj map[string]any, field string, allowed map[string]struct{}) (map[string]any, *tools.ExecutionError) {
	out := map[string]any{}
	for key, value := range obj {
		if _, ok := allowed[key]; !ok {
			return nil, &tools.ExecutionError{ErrorClass: errorArgsInvalid, Message: "contents option has unknown field", Details: map[string]any{"field": field + "." + key}}
		}
		if key == "query" {
			text, ok := value.(string)
			if !ok {
				return nil, &tools.ExecutionError{ErrorClass: errorArgsInvalid, Message: "contents query must be a string", Details: map[string]any{"field": field + "." + key}}
			}
			out[key] = text
			continue
		}
		integer, err := asPositiveInteger(value, field+"."+key)
		if err != nil {
			return nil, err
		}
		out[key] = integer
	}
	return out, nil
}

func asPositiveInteger(value any, field string) (int, *tools.ExecutionError) {
	var integer int
	switch typed := value.(type) {
	case int:
		integer = typed
	case float64:
		integer = int(typed)
		if typed != float64(integer) {
			return 0, &tools.ExecutionError{ErrorClass: errorArgsInvalid, Message: "contents numeric option must be a positive integer", Details: map[string]any{"field": field}}
		}
	default:
		return 0, &tools.ExecutionError{ErrorClass: errorArgsInvalid, Message: "contents numeric option must be a positive integer", Details: map[string]any{"field": field}}
	}
	if integer <= 0 {
		return 0, &tools.ExecutionError{ErrorClass: errorArgsInvalid, Message: "contents numeric option must be a positive integer", Details: map[string]any{"field": field}}
	}
	return integer, nil
}

func resolveExaSearchEndpoint(baseURL string) (string, error) {
	cleaned := strings.TrimSpace(baseURL)
	if cleaned == "" {
		return exaDefaultEndpoint, nil
	}
	if !strings.Contains(cleaned, "://") {
		cleaned = "https://" + cleaned
	}
	normalized, err := sharedoutbound.DefaultPolicy().NormalizeBaseURL(cleaned)
	if err != nil {
		return "", err
	}
	parsed, err := url.Parse(normalized)
	if err != nil {
		return "", err
	}
	path := strings.TrimRight(parsed.Path, "/")
	if !strings.HasSuffix(path, "/search") {
		if path == "" {
			path = "/search"
		} else {
			path += "/search"
		}
	}
	parsed.Path = path
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String(), nil
}

func exaDescription(item exaSearchResult) string {
	cleanedHighlights := make([]string, 0, len(item.Highlights))
	for _, highlight := range item.Highlights {
		if cleaned := strings.TrimSpace(highlight); cleaned != "" {
			cleanedHighlights = append(cleanedHighlights, cleaned)
		}
	}
	if len(cleanedHighlights) > 0 {
		return strings.Join(cleanedHighlights, "\n")
	}
	if summary := strings.TrimSpace(item.Summary); summary != "" {
		return summary
	}
	return strings.TrimSpace(item.Text)
}

func exaSiteName(item exaSearchResult, urlText string) string {
	if siteName := strings.TrimSpace(item.SiteName); siteName != "" {
		return siteName
	}
	return titleFromURL(urlText)
}
