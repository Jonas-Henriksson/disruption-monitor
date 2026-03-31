@echo off
title SC Hub Disruption Monitor
powershell -ExecutionPolicy Bypass -File "%~dp0startup.ps1" %*
