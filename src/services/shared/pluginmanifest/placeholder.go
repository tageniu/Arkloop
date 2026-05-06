package pluginmanifest

import (
	"fmt"
	"regexp"
	"strings"
)

var placeholderPattern = regexp.MustCompile(`\$\{([^}]+)\}`)

type PlaceholderContext struct {
	RuntimePaths map[string]string
	Settings     map[string]string
	PluginData   string
	Arch         string
	Platform     string
}

func ResolveString(value string, ctx PlaceholderContext) (string, error) {
	var firstErr error
	resolved := placeholderPattern.ReplaceAllStringFunc(value, func(token string) string {
		if firstErr != nil {
			return token
		}
		key := strings.TrimSuffix(strings.TrimPrefix(token, "${"), "}")
		replacement, err := resolvePlaceholder(key, ctx)
		if err != nil {
			firstErr = err
			return token
		}
		return replacement
	})
	if firstErr != nil {
		return "", firstErr
	}
	return resolved, nil
}

func ResolveStringSlice(values []string, ctx PlaceholderContext) ([]string, error) {
	resolved := make([]string, len(values))
	for index, value := range values {
		next, err := ResolveString(value, ctx)
		if err != nil {
			return nil, err
		}
		resolved[index] = next
	}
	return resolved, nil
}

func ResolveStringMap(values map[string]string, ctx PlaceholderContext) (map[string]string, error) {
	if len(values) == 0 {
		return nil, nil
	}
	resolved := make(map[string]string, len(values))
	for key, value := range values {
		next, err := ResolveString(value, ctx)
		if err != nil {
			return nil, err
		}
		resolved[key] = next
	}
	return resolved, nil
}

func resolvePlaceholder(key string, ctx PlaceholderContext) (string, error) {
	switch {
	case key == "PLUGIN_DATA":
		return ctx.PluginData, nil
	case key == "arch":
		return ctx.Arch, nil
	case key == "platform":
		return ctx.Platform, nil
	case strings.HasPrefix(key, "runtime.") && strings.HasSuffix(key, ".path"):
		id := strings.TrimSuffix(strings.TrimPrefix(key, "runtime."), ".path")
		if value, ok := ctx.RuntimePaths[id]; ok {
			return value, nil
		}
	case strings.HasPrefix(key, "settings."):
		settingKey := strings.TrimPrefix(key, "settings.")
		if value, ok := ctx.Settings[settingKey]; ok {
			return value, nil
		}
	}
	return "", fmt.Errorf("unknown plugin placeholder %q", key)
}
