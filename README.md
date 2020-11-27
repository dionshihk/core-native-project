A lightweight framework based on React Native + Redux + Redux Saga, in strict TypeScript.

[![Build Status](https://github.com/dionshihk/core-native-project/workflows/build/badge.svg)](https://github.com/dionshihk/core-native-project/actions)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/dionshihk/core-native-project.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/dionshihk/core-native-project/context:javascript)
[![Total alerts](https://img.shields.io/lgtm/alerts/g/dionshihk/core-native-project.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/dionshihk/core-native-project/alerts/)

## Basic Features:

The whole app is split into **modules**, usually by navigation screens.

For each module, it contains **1 state** and **some actions**, to handle business logic.

No matter sync or async, every action is automatically wrapped as saga generator.

To extend module features, modules can also implement its own lifecycle actions, like onEnter/onDestroy/onActive/onBlur etc.

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

https://github.com/neowu/core-fe-project

Our idea is also inspired by many React-based frameworks

https://github.com/dvajs/dva

https://github.com/rematch/rematch

https://github.com/wangtao0101/resa
