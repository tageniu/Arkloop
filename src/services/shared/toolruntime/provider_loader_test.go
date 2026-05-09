package toolruntime

import "testing"

func TestEvaluateProviderRuntimeStatusNowledge(t *testing.T) {
	state, reason := evaluateProviderRuntimeStatus(ProviderRuntimeStatus{
		GroupName:    "memory",
		ProviderName: "memory.nowledge",
		BaseURL:      strPtr("http://nowledge.internal"),
		APIKeyValue:  strPtr("nowledge-key"),
	})
	if state != ProviderRuntimeStateReady || reason != "" {
		t.Fatalf("expected ready status, got %s %q", state, reason)
	}

	state, reason = evaluateProviderRuntimeStatus(ProviderRuntimeStatus{
		GroupName:    "memory",
		ProviderName: "memory.nowledge",
		BaseURL:      strPtr("http://nowledge.internal"),
	})
	if state != ProviderRuntimeStateMissingConfig || reason != "missing_api_key" {
		t.Fatalf("expected missing api key, got %s %q", state, reason)
	}
}

func TestEvaluateProviderRuntimeStatusExa(t *testing.T) {
	t.Setenv("EXA_API_KEY", "")

	state, reason := evaluateProviderRuntimeStatus(ProviderRuntimeStatus{
		GroupName:    "web_search",
		ProviderName: "web_search.exa",
		APIKeyValue:  strPtr("exa-key"),
	})
	if state != ProviderRuntimeStateReady || reason != "" {
		t.Fatalf("expected ready status, got %s %q", state, reason)
	}

	state, reason = evaluateProviderRuntimeStatus(ProviderRuntimeStatus{
		GroupName:    "web_search",
		ProviderName: "web_search.exa",
	})
	if state != ProviderRuntimeStateMissingConfig || reason != "missing_api_key" {
		t.Fatalf("expected missing api key, got %s %q", state, reason)
	}

	t.Setenv("EXA_API_KEY", "exa-env-key")
	state, reason = evaluateProviderRuntimeStatus(ProviderRuntimeStatus{
		GroupName:    "web_search",
		ProviderName: "web_search.exa",
	})
	if state != ProviderRuntimeStateReady || reason != "" {
		t.Fatalf("expected ready status from env key, got %s %q", state, reason)
	}

	state, reason = evaluateProviderRuntimeStatus(ProviderRuntimeStatus{
		GroupName:    "web_search",
		ProviderName: "web_search.exa",
		APIKeyValue:  strPtr("exa-key"),
		BaseURL:      strPtr("ftp://api.exa.ai"),
	})
	if state != ProviderRuntimeStateInvalidConfig || reason != "invalid_base_url" {
		t.Fatalf("expected invalid base url, got %s %q", state, reason)
	}
}
