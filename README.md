A lightweight framework based on React Native + Redux + Redux Saga, in strict TypeScript.

[![Build Status](https://travis-ci.com/dionshihk/core-native-framework.svg?branch=master)](https://travis-ci.com/dionshihk/core-native-framework)

## Basic Features:

The whole app is split into **modules**, usually by navigation screens.

For each module, it contains **1 state** and **some actions**, to handle business logic.

No matter sync or async, every action is automatically wrapped as saga generator.

To extend module features, modules can also implement its own lifecycle actions, like onEnter/onDestroy/onActive etc.

## Advanced Features

(1) Global error handler

(2) Event log collector

(3) Built-in decorator

## Core API:

- startApp

Bootstrap function, configuring entry component / error handler / log / initialization action.

- register

Register a module (including lifecycle actions and custom actions).

## Usage:

(To be done)

## Similar Frameworks

We also develop a same (90% similarity) framework for website, using the same tech stack.

https://github.com/dionshihk/react-native-core-framework

Our idea is also inspired by many React-based frameworks

https://github.com/dvajs/dva

https://github.com/rematch/rematch

https://github.com/wangtao0101/resa
