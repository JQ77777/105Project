<script setup></script>

<template>
  <div id="app">
    <router-view></router-view>
  </div>
</template>

<style>
#app {
  min-height: 100vh;
  background-image: url('/background.png');
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  background-attachment: fixed;
  color: white;
}
</style>
