package main

import (
    "fmt"
    log "github.com/x/log"
    "os"
)

type User struct {
	ID          int    `json:"id"`
	DisplayName string `json:"name"`
	Age         int
}

const (
    A      = 1
    Longer = 2
)
