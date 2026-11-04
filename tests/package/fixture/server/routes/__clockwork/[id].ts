import fixture from '../../fixture.json'

export default defineEventHandler((event) => {
  if (getRouterParam(event, 'id') !== (fixture.record as { id: string }).id) {
    throw createError({ statusCode: 404 })
  }
  return fixture.record
})
