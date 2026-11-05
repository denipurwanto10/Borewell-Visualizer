package main

import (
	"fmt"
	"os"

	"github.com/borewell/visualizer/backend/internal/auth"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: hash-password <password>")
		os.Exit(1)
	}

	password := os.Args[1]
	params := auth.DefaultParams()
	hash, err := auth.HashPassword(password, params)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(hash)
}