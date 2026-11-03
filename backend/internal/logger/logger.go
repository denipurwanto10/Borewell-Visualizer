package logger

import (
	"context"
	"os"
	"strings"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

type Logger struct {
	*zap.Logger
}

var defaultLogger *Logger

func Init(level string) (*Logger, error) {
	var cfg zap.Config
	if strings.ToLower(level) == "production" || strings.ToLower(level) == "prod" {
		cfg = zap.NewProductionConfig()
		cfg.EncoderConfig.TimeKey = "timestamp"
		cfg.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	} else {
		cfg = zap.NewDevelopmentConfig()
		cfg.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
	}

	lvl, err := zapcore.ParseLevel(level)
	if err != nil {
		lvl = zapcore.InfoLevel
	}
	cfg.Level = zap.NewAtomicLevelAt(lvl)

	zl, err := cfg.Build(zap.AddCallerSkip(1))
	if err != nil {
		return nil, err
	}

	logger := &Logger{Logger: zl}
	defaultLogger = logger
	return logger, nil
}

func Get() *Logger {
	if defaultLogger == nil {
		l, _ := Init("info")
		return l
	}
	return defaultLogger
}

func (l *Logger) WithContext(ctx context.Context) *Logger {
	requestID := ""
	if rid := ctx.Value("request_id"); rid != nil {
		requestID = rid.(string)
	}
	if requestID != "" {
		return &Logger{Logger: l.Logger.With(zap.String("request_id", requestID))}
	}
	return l
}

func (l *Logger) WithFields(fields map[string]any) *Logger {
	zapFields := make([]zap.Field, 0, len(fields))
	for k, v := range fields {
		zapFields = append(zapFields, zap.Any(k, v))
	}
	return &Logger{Logger: l.Logger.With(zapFields...)}
}

func (l *Logger) WithError(err error) *Logger {
	return &Logger{Logger: l.Logger.With(zap.Error(err))}
}

func Sync() {
	if defaultLogger != nil {
		_ = defaultLogger.Logger.Sync()
	}
}

func Field(key string, value any) zap.Field {
	return zap.Any(key, value)
}

func Fatal(msg string, fields ...zap.Field) {
	Get().Logger.Fatal(msg, fields...)
	os.Exit(1)
}

func Info(msg string, fields ...zap.Field) {
	Get().Logger.Info(msg, fields...)
}

func Error(msg string, fields ...zap.Field) {
	Get().Logger.Error(msg, fields...)
}

func Warn(msg string, fields ...zap.Field) {
	Get().Logger.Warn(msg, fields...)
}

func Debug(msg string, fields ...zap.Field) {
	Get().Logger.Debug(msg, fields...)
}