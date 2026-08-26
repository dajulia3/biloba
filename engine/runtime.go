package engine

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/chromedp"
)

// HandlerResponse is the typed wire-neutral result returned by a biloba.js atomic handler.
type HandlerResponse struct {
	Success bool   `json:"success"`
	Err     string `json:"error"`
	Result  any    `json:"result"`
	Found   *bool  `json:"found"`
}

// EvaluateContext evaluates JavaScript against an attached chromedp target without changing its executor.
func EvaluateContext(ctx context.Context, script string, awaitPromise bool, result any) error {
	encoded, err := EvaluateRawContext(ctx, script, awaitPromise)
	if err != nil {
		return err
	}
	if result == nil || len(encoded) == 0 {
		return nil
	}
	return json.Unmarshal(encoded, result)
}

// EvaluateRawContext evaluates JavaScript and returns its JSON encoding; undefined is empty bytes.
func EvaluateRawContext(ctx context.Context, script string, awaitPromise bool) ([]byte, error) {
	var encoded []byte
	err := chromedp.Run(ctx, chromedp.EvaluateAsDevTools(script, &encoded, func(params *runtime.EvaluateParams) *runtime.EvaluateParams {
		params = params.WithUserGesture(true)
		if awaitPromise {
			params = params.WithAwaitPromise(true)
		}
		return params
	}))
	if err != nil {
		return nil, err
	}
	return encoded, nil
}

// RunHandlerContext invokes one existing biloba.js handler atomically with an encoded selector.
func RunHandlerContext(ctx context.Context, name string, encodedSelector string, args ...any) (HandlerResponse, error) {
	parameters := append([]any{encodedSelector}, args...)
	if encodedSelector == "" {
		parameters = append([]any{}, args...)
	}
	encoded, err := json.Marshal(parameters)
	if err != nil {
		return HandlerResponse{}, err
	}
	var response HandlerResponse
	err = EvaluateContext(ctx, fmt.Sprintf("_biloba.%s(...%s)", name, encoded), false, &response)
	return response, err
}
